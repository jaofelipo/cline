/* eslint-disable react-hooks/rules-of-hooks */
/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable no-extend-native */
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
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  Function.prototype.useCallback = function <T extends Function>(this: T, deps: React.DependencyList): T 
  {
    return React.useCallback(this, deps) as T;
  }
}