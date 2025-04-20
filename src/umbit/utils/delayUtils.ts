import pWaitFor from "p-wait-for";

export async function waitForCondition(callback: () => boolean, interval:number=100, timeout:number=15_000): Promise<void> 
{
    try 
    {
        await pWaitFor(callback, (interval && timeout) ? { interval, timeout } : {});
    } catch (e) {}
}
