import { FuseResult, RangeTuple } from "fuse.js"
import { setValue } from "./objectUtils"

// https://gist.github.com/evenfrost/1ba123656ded32fb7a0cd4651efd4db0

export function highlight(fuseSearchResult: FuseResult<any>[], highlightClassName: string = "history-item-highlight")  
{
	const highlightedResults: any[] = []

	for (const { item, matches } of fuseSearchResult) 
	{
		if (matches && matches.length > 0) 
		{
			const highlightedItem = { ...item }

			for (const match of matches) 
			{
				if (match.key && typeof match.value === "string" && match.indices) 
				{

					const mergedIndices = getLargestDifferenceRegions([...match.indices])//mergeRegions([...match.indices]) Old mode
					let content = match.value

					if (mergedIndices.length > 0) 
					{
						content = ''
						let lastIndex = 0
						for (const region of mergedIndices) 
						{
							const start = region[0];
							const upperLimit = region[1] + 1;
				
							content += match.value.substring(lastIndex, start);
							content += `<span class="${highlightClassName}">`;
							content += match.value.substring(start, upperLimit);
							content += "</span>";
				
							lastIndex = upperLimit;
						}
						content += match.value.substring(lastIndex)
					}
					setValue(highlightedItem, match.key, content)
				}
			}
			highlightedResults.push(highlightedItem)
		}
	}

	return highlightedResults
}

function getLargestDifferenceRegions(regions:readonly RangeTuple[] = []) 
{
	let maxDifference = -Infinity
	let result:[number, number][] = []

	for (const [start, end] of regions)
	{
		const difference = end - start

		if (difference > maxDifference) 
		{
			maxDifference = difference
			result = [[start, end]]
		}
		else if (difference === maxDifference) 
		{
			result.push([start, end])
		}
	}
	return result.sort((a, b) => a[0] - b[0]); 
}


// Function to merge overlapping regions
// Merge overlapping regions before generating highlighted text return a lot os possible results, depends what we want
function mergeRegions (regions: [number, number][]): [number, number][] 
{
    if (regions.length === 0) 
    {
        regions.sort((a, b) => a[0] - b[0]) // Sort regions by start index
        const merged: [number, number][] = [regions[0]]
        for (const [start, end] of regions) 
        {
            const last = merged[merged.length - 1]
            if (start <= last[1] + 1) 
                last[1] = Math.max(last[1], end) // Overlapping or adjacent regions
            else
                merged.push([start, end])
        }
        return merged
    }
    return regions
}