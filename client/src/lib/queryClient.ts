import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { getTenantHeaders } from "./tenant-config";
import { config } from "./config";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
  accessToken?: unknown | undefined,
): Promise<Response> {
  const apiUrl = config.API_URL; // Accessing the env variable
  const tenantHeaders = getTenantHeaders();
  
  const headers: Record<string, string> = {
    ...tenantHeaders,
  };
  
  if (data) {
    headers["Authorization"] = `Bearer ${accessToken}`;
    headers["Content-Type"] = "application/json";
  }
  
  const res = await fetch(`${apiUrl}${url}`, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    //credentials: "include",
  });
  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    
    if (queryKey.length == 1 || queryKey[1] == '') {
      return undefined;
    }
    const apiUrl = config.API_URL; // Accessing the env variable
    const tenantHeaders = getTenantHeaders();
    
    const res = await fetch(`${apiUrl}${queryKey[0] as string}`, {
      headers: { 
        Authorization: `Bearer ${queryKey[1] as string}`, 
        "Content-Type": "application/json",
        ...tenantHeaders
      },
      //credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    
    let datawrapper = await res.json();
    return (datawrapper)?.data;
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
