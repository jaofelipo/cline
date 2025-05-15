export class StringUtils
{
    static compareStrings(str1: string, str2: string): string 
    {
        const maxLength = Math.max(str1.length, str2.length)
        let resultado = ''
        for (let i = 0; i < maxLength; i++) 
        {
            const char1 = str1[i] || ''
            const char2 = str2[i] || '' 
    
            if (char1 !== char2) 
                resultado += `[${char1 || ' '}:${char2 || ' '}]`
            else 
                resultado += char1
        }
        return resultado
    }
}