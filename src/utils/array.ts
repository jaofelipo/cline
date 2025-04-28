/**
 * Returns the index of the last element in the array where predicate is true, and -1
 * otherwise.
 * @param array The source array to search in
 * @param predicate find calls predicate once for each element of the array, in descending
 * order, until it finds one where predicate returns true. If such an element is found,
 * findLastIndex immediately returns that element index. Otherwise, findLastIndex returns -1.
 */
export function findLastIndex<T>(array: Array<T>, predicate: (value: T, index: number, obj: T[]) => boolean): number
{
	let length = array.length
	while (length--) 
	{
		if (predicate(array[length], length, array))
			return length
	}
	return -1
}


export function findLastIndexByField<T>(array: Array<T>, field: keyof T, values: any[]): number 
{
	let length = array.length;
	while (length--) 
	{
	  if (!values.includes(array[length][field])) 
		return length;
	}
	return -1;
}


export function findLast<T>(array: Array<T>, predicate: (value: T, index: number, obj: T[]) => boolean): T | undefined 
{
	const index = findLastIndex(array, predicate)
	return index === -1 ? undefined : array[index]
}


export function removeAfterLast<T>(array: Array<T>, predicate: (value: T, index: number, obj: T[]) => boolean): T[] 
{
	const lastIndex = findLastIndex(array, predicate)
	return (lastIndex !== -1) ? array.splice(lastIndex + 1) : array
}

export function removeLastIfMatchesCriteria<T, P>(array: T[],  predicate: (value: T, index: number, array: T[]) => boolean,  criteria: (parsed:any) => boolean): T[] 
{
    const lastIndex = findLastIndex(array, predicate)
    
    if (lastIndex !== -1) 
	{
        const parsed = JSON.parse((array[lastIndex] as any).text || "{}") as P
        if (criteria(parsed)) 
            array.splice(lastIndex, 1);
    }
    return array;
}

/**
 * Trims empty strings from array start/end.
 * @param source Array to trim
 * @param trimStart Trim empty start? (default: true)
 * @param trimEnd Trim empty end? (default: true)
 */
export function trimLines(source:string[], trimStart=true, trimEnd=true)
{
    const start = (trimStart) ? source.findIndex(v => v !== "") : 0
    const end = (trimEnd) ? findLastIndex(source, v => v !== "") + 1 : source.length
    return start >= 0 && end >= start ? source.slice(start, end) : []
}