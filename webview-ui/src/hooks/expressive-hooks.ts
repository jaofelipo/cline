import React from "react";

declare global 
{
  interface Function 
  {
    __id__?: string;
    useCallback<T extends Function>(this: T, deps: React.DependencyList): T;
  }
}

if (!Function.prototype.useCallback) 
{
  Function.prototype.useCallback = function <T extends Function>(this: T, deps: React.DependencyList): T 
  {
    return React.useCallback(this, deps) as T;
  }
}