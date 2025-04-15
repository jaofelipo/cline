/**
 * Sets a nested value in a target object using a dot-notation path.
 * @example
 * const obj = { user: { name: "John" } };
 * setValue(obj, "user.name", "Alice"); // { user: { name: "Alice" } }
 */
export function setValue(target: Record<string, any>, fieldPath: string, value: any) 
{
	const pathArray = fieldPath.split(".")
	const lastField = pathArray.pop()!
	for (const field of pathArray) 
	{
		target = target[field]
	}
	target[lastField] = value
	return target
}