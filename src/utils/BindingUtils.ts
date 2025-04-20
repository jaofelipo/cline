export class BindingUtils
{
    private static __callbackMap = new WeakMap<object, Array<(data: any) => void>>()

    private static track<T extends object>(obj: T): T 
    {
        if (obj && typeof obj === 'object' && Reflect.getPrototypeOf(obj) === Proxy.prototype) 
            return obj // If it's a proxy, then return

        return new Proxy(obj, {
            get(target, prop) 
            {
                const value = Reflect.get(target, prop)
                if (Array.isArray(target) && ['push', 'pop', 'shift', 'unshift'].includes(prop as string)) 
                {
                    return function (...args: any[]) 
                    {
                        const result = (target as any)[prop](...args)
                        BindingUtils.invokeCallbacks(target as T)
                        return result
                    }
                }
                return (typeof value === 'object' && value !== null) ? BindingUtils.track(value) : value
            },

            set(target, prop, value) 
            {
                const result = Reflect.set(target, prop, value)
                BindingUtils.invokeCallbacks(target as T)
                return result;
            },

            deleteProperty(target, prop) 
            {
                if (prop in target) 
                {
                    const result = Reflect.deleteProperty(target, prop)
                    BindingUtils.invokeCallbacks(target as T)
                    return result;
                }
                return true // Property doesn't exist, so deletion is "successful"
            }
        })
    }

    static bind<T extends object, K extends keyof T>(parent: T, target: K, onChange: (data: T[K]) => void | Promise<void>): void
    {
        const data = parent[target]

        if (typeof data === 'object' && data !== null) 
        {
            if (!BindingUtils.__callbackMap.has(data)) 
                BindingUtils.__callbackMap.set(data, []);
            BindingUtils.__callbackMap.get(data)!.push((newData) =>  onChange(newData));
            parent[target] = BindingUtils.track(data);        
        }
    }

    static unbind<T extends object>(data: T, onChange: (data: T) => void | Promise<void>): void 
    {
        if (BindingUtils.__callbackMap.has(data)) 
        {
            const callbacks = BindingUtils.__callbackMap.get(data)!
            const index = callbacks.findIndex(cb => cb === onChange)
            if (index !== -1)
                callbacks.splice(index, 1)
            if (callbacks.length === 0)
                BindingUtils.__callbackMap.delete(data)
        }
    }
    
    private static async invokeCallbacks(target: object): Promise<void> 
    {
        if (BindingUtils.__callbackMap.has(target)) 
            await Promise.all(BindingUtils.__callbackMap.get(target)!.map(cb => cb(target))).catch()
    }    
}
