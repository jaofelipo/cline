interface RetryOptions {
	maxRetries?: number
	baseDelay?: number
	maxDelay?: number
	retryAllErrors?: boolean
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
	maxRetries: 3,
	baseDelay: 1_000,
	maxDelay: 10_000,
	retryAllErrors: false,
}

export function withRetry(options: RetryOptions = {}) 
{
	const { maxRetries, baseDelay, maxDelay, retryAllErrors } = { ...DEFAULT_OPTIONS, ...options }

	return function (_target: any, _propertyKey: string, descriptor: PropertyDescriptor) 
	{
		const originalMethod = descriptor.value

		descriptor.value = async function* (...args: any[]) 
		{
			for (let attempt = 0; attempt < maxRetries; attempt++) 
			{
				try 
				{
					yield* originalMethod.apply(this, args)
					return
				} 
				catch (error: any) 
				{
					const isRateLimit = error?.status === 429
					const isLastAttempt = attempt === maxRetries - 1

					if ((!isRateLimit && !retryAllErrors) || isLastAttempt) 
						throw error
					
					// Get retry delay from header or calculate exponential backoff, Check various rate limit headers
					const retryAfter =	error.headers?.["retry-after"] || error.headers?.["x-ratelimit-reset"] || error.headers?.["ratelimit-reset"]

					let delay = Math.min(maxDelay, baseDelay * Math.pow(2, attempt)) // Use exponential backoff if no header
					if (retryAfter) 
					{
						const retryValue = parseInt(retryAfter, 10)
						delay = retryValue * 1000 //delta-seconds
						if (retryValue > Date.now() / 1000) // Handle Unix timestamp formats
							delay = delay - Date.now() 
					}
					
					await new Promise((resolve) => setTimeout(resolve, delay))
				}
			}
		}
		return descriptor
	}
}