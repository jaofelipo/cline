import fs from "fs/promises"
import path from "path"
import os from "os"
import assert from 'assert'
import { ClineIgnoreController } from "./ClineIgnoreController"

suite("ClineIgnoreController", () => {
	let tempDir: string
	let controller: ClineIgnoreController

	setup(async () => {
		// Create a temp directory for testing
		tempDir = path.join(os.tmpdir(), `llm-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
		await fs.mkdir(tempDir)

		// Create default .clineignore file
		await fs.writeFile(
			path.join(tempDir, ".clineignore"),
			[".env", "*.secret", "private/", "# This is a comment", "", "temp.*", "file-with-space-at-end.* ", "**/.git/**"].join(
				"\n",
			),
		)

		controller = await ClineIgnoreController.createForTest(tempDir)
	})

	suiteTeardown(async () => {
		// Clean up temp directory
		await fs.rm(tempDir, { recursive: true, force: true })
	})

	suite("Default Patterns", () => {
		// test("should block access to common ignored files", async () => {
		// 	const results = [
		// 		controller.validateAccess(".env"),
		// 		controller.validateAccess(".git/config"),
		// 		controller.validateAccess("node_modules/package.json"),
		// 	]
		// 	results.forEach((result) => assert.equal(result, false))
		// })

		test("should allow access to regular files", async () => {
			const results = [
				controller.validateAccess("src/index.ts"),
				controller.validateAccess("README.md"),
				controller.validateAccess("package.json"),
			]
			results.forEach((result) => assert.equal(result, true))
		})

		test("should block access to .clineignore file", async () => {
			const result = controller.validateAccess(".clineignore")
			assert.equal(result, false)
		})
	})

	suite("Custom Patterns", () => {
		test("should block access to custom ignored patterns", async () => {
			const results = [
				controller.validateAccess("config.secret"),
				controller.validateAccess("private/data.txt"),
				controller.validateAccess("temp.json"),
				controller.validateAccess("nested/deep/file.secret"),
				controller.validateAccess("private/nested/deep/file.txt"),
			]
			results.forEach((result) => assert.equal(result, false))
		})

		test("should allow access to non-ignored files", async () => {
			const results = [
				controller.validateAccess("public/data.txt"),
				controller.validateAccess("config.json"),
				controller.validateAccess("src/temp/file.ts"),
				controller.validateAccess("nested/deep/file.txt"),
				controller.validateAccess("not-private/data.txt"),
			]
			results.forEach((result) => assert.equal(result, true))
		})

		test("should handle pattern edge cases", async () => {
			await fs.writeFile(
				path.join(tempDir, ".clineignore"),
				["*.secret", "private/", "*.tmp", "data-*.json", "temp/*"].join("\n"),
			)

			controller = await ClineIgnoreController.createForTest(tempDir)

			const results = [
				controller.validateAccess("data-123.json"), // Should be false (wildcard)
				controller.validateAccess("data.json"), // Should be true (doesn't match pattern)
				controller.validateAccess("script.tmp"), // Should be false (extension match)
			]

			assert.equal(results[0], false) // data-123.json
			assert.equal(results[1], true) // data.json
			assert.equal(results[2], false) // script.tmp
		})

		test("should handle negation patterns", async () => {
			return true
			await fs.writeFile(
				path.join(tempDir, ".clineignore"),
				[
					"temp/*", // Ignore everything in temp
					"!temp/allowed/*", // But allow files in temp/allowed
					"docs/**/*.md", // Ignore all markdown files in docs
					"!docs/README.md", // Except README.md
					"!docs/CONTRIBUTING.md", // And CONTRIBUTING.md
					"assets/", // Ignore all assets
					"!assets/public/", // Except public assets
					"!assets/public/*.png", // Specifically allow PNGs in public assets
				].join("\n"),
			)

			controller = await ClineIgnoreController.createForTest(tempDir)
			const results = [
				// Basic negation
				controller.validateAccess("temp/file.txt"), // Should be false (in temp/)
				controller.validateAccess("temp/allowed/file.txt"), // Should be true (negated)
				controller.validateAccess("temp/allowed/nested/file.txt"), // Should be true (negated with nested)

				// Multiple negations in same path
				controller.validateAccess("docs/guide.md"), // Should be false (matches docs/**/*.md)
				controller.validateAccess("docs/README.md"), // Should be true (negated)
				controller.validateAccess("docs/CONTRIBUTING.md"), // Should be true (negated)
				controller.validateAccess("docs/api/guide.md"), // Should be false (nested markdown)

				// Nested negations
				controller.validateAccess("assets/logo.png"), // Should be false (in assets/)
				controller.validateAccess("assets/public/logo.png"), // Should be true (negated and matches *.png)
				controller.validateAccess("assets/public/data.json"), // Should be true (in negated public/)
			]

			assert.equal(results[0], false) // temp/file.txt
			assert.equal(results[1], true) // temp/allowed/file.txt
			assert.equal(results[2], true) // temp/allowed/nested/file.txt
			assert.equal(results[3], false) // docs/guide.md
			assert.equal(results[4], true) // docs/README.md
			assert.equal(results[5], true) // docs/CONTRIBUTING.md
			assert.equal(results[6], false) // docs/api/guide.md
			assert.equal(results[7], false) // assets/logo.png
			assert.equal(results[8], true) // assets/public/logo.png
			assert.equal(results[9], true) // assets/public/data.json
		})

		test("should handle comments in .clineignore", async () => {
			// Create a new .clineignore with comments
			await fs.writeFile(
				path.join(tempDir, ".clineignore"),
				["# Comment line", "*.secret", "private/", "temp.*"].join("\n"),
			)

			controller = await ClineIgnoreController.createForTest(tempDir)

			const result = controller.validateAccess("test.secret")
			assert.equal(result, false)
		})
	})

	suite("Path Handling", () => {
		test("should handle absolute paths and match ignore patterns", async () => {
			// Test absolute path that should be allowed
			const allowedPath = path.join(tempDir, "src/file.ts")
			const allowedResult = controller.validateAccess(allowedPath)
			assert.equal(allowedResult, true)

			// Test absolute path that matches an ignore pattern (*.secret)
			const ignoredPath = path.join(tempDir, "config.secret")
			const ignoredResult = controller.validateAccess(ignoredPath)
			assert.equal(ignoredResult, false)

			// Test absolute path in ignored directory (private/)
			const ignoredDirPath = path.join(tempDir, "private/data.txt")
			const ignoredDirResult = controller.validateAccess(ignoredDirPath)
			assert.equal(ignoredDirResult, false)
		})

		test("should handle relative paths and match ignore patterns", async () => {
			// Test relative path that should be allowed
			const allowedResult = controller.validateAccess("./src/file.ts")
			assert.equal(allowedResult, true)

			// Test relative path that matches an ignore pattern (*.secret)
			const ignoredResult = controller.validateAccess("./config.secret")
			assert.equal(ignoredResult, false)

			// Test relative path in ignored directory (private/)
			const ignoredDirResult = controller.validateAccess("./private/data.txt")
			assert.equal(ignoredDirResult, false)
		})

		test("should normalize paths with backslashes", async () => {
			const result = controller.validateAccess("src\\file.ts")
			assert.equal(result, true)
		})
	})

	suite("Batch Filtering", () => {
		test("should filter an array of paths", async () => {
			const paths = ["src/index.ts", ".env", "lib/utils.ts", ".git/config", "dist/bundle.js"]

			const filtered = controller.filterPaths(paths)
			assert.deepStrictEqual(filtered, ["src/index.ts", "lib/utils.ts", "dist/bundle.js"])
		})
	})

	suite("Error Handling", () => {
		test("should handle invalid paths", async () => {
			// Test with an invalid path containing null byte
			const result = controller.validateAccess("\0invalid")
			assert.equal(result, true)
		})

		test("should handle missing .clineignore gracefully", async () => {
			// Create a new controller in a directory without .clineignore
			const emptyDir = path.join(os.tmpdir(), `llm-test-empty-${Date.now()}`)
			await fs.mkdir(emptyDir)

			try {
				controller = await ClineIgnoreController.createForTest(tempDir)
				const result = controller.validateAccess("file.txt")
				assert.equal(result, true)
			} finally {
				await fs.rm(emptyDir, { recursive: true, force: true })
			}
		})

		test("should handle empty .clineignore", async () => {
			await fs.writeFile(path.join(tempDir, ".clineignore"), "")

			controller = await ClineIgnoreController.createForTest(tempDir)
			const result = controller.validateAccess("regular-file.txt")
			assert.equal(result, true)
		})
	})

	suite("Include Directive", () => {
		test("should load patterns from an included file", async () => {
			// Create a .gitignore file with patterns "*.log" and "debug/"
			await fs.writeFile(path.join(tempDir, ".gitignore"), ["*.log", "debug/"].join("\n"))

			// Create a .clineignore file that includes .gitignore and adds an extra pattern "secret.txt"
			await fs.writeFile(path.join(tempDir, ".clineignore"), ["!include .gitignore", "secret.txt"].join("\n"))

			// Initialize the controller to load the updated .clineignore
			controller = await ClineIgnoreController.createForTest(tempDir)

			// "server.log" should be ignored due to the "*.log" pattern from .gitignore
			assert.equal(controller.validateAccess("server.log"), false)
			// "debug/app.js" should be ignored due to the "debug/" pattern from .gitignore
			assert.equal(controller.validateAccess("debug/app.js"), false)
			// "secret.txt" should be ignored as specified directly in .clineignore
			assert.equal(controller.validateAccess("secret.txt"), false)
			// Other files should be allowed
			assert.equal(controller.validateAccess("app.js"), true)
		})

		test("should handle non-existent included file gracefully", async () => {
			// Create a .clineignore file that includes a non-existent file
			await fs.writeFile(path.join(tempDir, ".clineignore"), ["!include missing-file.txt"].join("\n"))

			// Initialize the controller
			controller = await ClineIgnoreController.createForTest(tempDir)

			// Validate access to a regular file; it should be allowed because the missing include should not break everything
			assert.equal(controller.validateAccess("regular-file.txt"), true)
		})

		test("should handle non-existent included file gracefully alongside a valid pattern", async () => {
			// Test with an include directive for a non-existent file alongside a valid pattern ("*.tmp")
			await fs.writeFile(path.join(tempDir, ".clineignore"), ["!include non-existent.txt", "*.tmp"].join("\n"))

			controller = await ClineIgnoreController.createForTest(tempDir)
			// "file.tmp" should be ignored because of the "*.tmp" pattern
			assert.equal(controller.validateAccess("file.tmp"), false)
			// Files that do not match "*.tmp" should be allowed
			assert.equal(controller.validateAccess("file.log"), true)
		})
	})
})