
import { useMsal } from '@azure/msal-react';
import { InteractionStatus } from '@azure/msal-browser';
import { useEffect, useState, useRef, useContext } from "react";
import { config } from '@/lib/config';
import { loginRequest } from '../authConfig';
import { JwtService } from '../services/jwt-services';
import { DataContext } from '@shared/models/chat-models';

export default function useAuth() {
    const { instance, accounts, inProgress } = useMsal();
    const [token, setToken] = useState('');
    const context = useContext(DataContext);
    // Resolves to the current agent (secondary-JWT) token once it's known, or null if it never
    // becomes available. This must be a single long-lived "deferred" resolved in place via
    // agentTokenResolveRef — not a ref reassigned to a brand-new Promise once the real value is
    // known: the message listener below can call `await agentTokenReadyRef.current` before that
    // reassignment happens, in which case it has already captured the OLD promise object, and
    // replacing .current later does nothing for that in-flight await (confirmed: without this,
    // the listener would resolve with token: null every time, having grabbed the initial
    // Promise.resolve(null) before getAgentToken below ever got a chance to run). Resolving the
    // same promise object in place fixes that regardless of ordering. getAgentToken calls
    // agentTokenResolveRef.current(...) as soon as it knows the answer (immediately, if already
    // cached in localStorage; otherwise once the fetch below completes) — so a
    // REQUEST_DELEGATED_TOKEN that arrives before the fetch finishes still gets answered once it
    // does, rather than racing a same-page consumer's single un-retried postMessage request
    // against this hook's own multi-step async chain (MSAL app token -> tenant guid -> JWT fetch).
    const agentTokenResolveRef = useRef<(token: string | null) => void>(() => {});
    const agentTokenReadyRef = useRef<Promise<string | null>>(undefined as unknown as Promise<string | null>);
    if (!agentTokenReadyRef.current) {
        agentTokenReadyRef.current = new Promise<string | null>((resolve) => {
            agentTokenResolveRef.current = resolve;
        });
    }

    useEffect(() => {
        // Clear localStorage on browser refresh
        const handleBeforeUnload = () => {
            // Remove all localStorage keys starting with 'agent-token' and 'agent-token-fetched'
            const keysToRemove = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && (key.startsWith('agent-token'))) {
                    keysToRemove.push(key);
                }
            }
            keysToRemove.forEach(key => localStorage.removeItem(key));
            console.log('Browser refresh/close detected, cleared agent-token keys from localStorage:', keysToRemove);
        };

        window.addEventListener('beforeunload', handleBeforeUnload);

        // Cleanup event listener
        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, []);

    // Registered unconditionally on mount, not nested inside getAgentToken's fetch below: a
    // REQUEST_DELEGATED_TOKEN can arrive (e.g. from AgentChatInterface's own loadToken effect,
    // firing on the same page load) before this hook's own MSAL-token -> tenant-guid -> JWT-fetch
    // chain finishes. Registering early and awaiting agentTokenReadyRef inside the handler means
    // that request gets answered once the token is known, instead of racing a same-page
    // consumer's single un-retried postMessage request against this chain — previously, on a hard
    // reload, that race was very often lost, silently starving every authenticated call
    // downstream (message history, spin-up agents) since they never even see a reply.
    useEffect(() => {
        const handleMessage = async (event: MessageEvent) => {
            const { type } = event.data ?? {};
            if (type !== 'REQUEST_DELEGATED_TOKEN') return;

            // SECURITY: Only accept messages from the expected domain
            if (event.origin + '/' !== config.MSAL_REDIRECT_URI) return;

            try {
                const resolvedToken = await agentTokenReadyRef.current;
                event.source?.postMessage(
                    { type: 'DELEGATED_TOKEN', token: resolvedToken }, {
                        targetOrigin: event.origin
                    }
                );
            } catch (err: any) {
                event.source?.postMessage(
                    { type: 'DELEGATED_TOKEN_ERROR', error: err.message },
                    {
                        targetOrigin: event.origin
                    }
                );
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    useEffect(() => {
        // React advises to declare the async function directly inside useEffect
        async function getAgentToken() {

            const existingToken = localStorage.getItem('agent-token-' + context.selectedTenantGuid);
            if (existingToken) {
                console.log('JWT token already exists in localStorage, skipping fetch');
                agentTokenResolveRef.current(existingToken);
                return;
            }

            const existingTokenFetched = localStorage.getItem('agent-token-fetched-' + context.selectedTenantGuid);
            // Get secondary JWT token using JwtService (only once)
            if (existingTokenFetched == null || existingTokenFetched == "false") {
                localStorage.setItem('agent-token-fetched-' + context.selectedTenantGuid, 'true');

                // Check if token already exists in localStorage
                const apiUrl = config.API_URL;

                if (apiUrl && context.selectedTenantGuid) {

                    const jwtService = new JwtService(apiUrl, token);
                    const tenantGuid = context.selectedTenantGuid;
                    try {
                        await jwtService.getJwtToken(tenantGuid);
                        console.log('Secondary JWT token retrieved and stored in localStorage');
                        agentTokenResolveRef.current(localStorage.getItem('agent-token-' + tenantGuid));
                    } catch (error) {
                        localStorage.setItem('agent-token-fetched-' + tenantGuid, 'false');
                        console.error('Failed to retrieve secondary JWT token:', error);
                        agentTokenResolveRef.current(null);
                    }
                }
            }

        }

        async function getAppToken() {
            try {
                const account = instance.getActiveAccount() ?? accounts[0];
                if (!account) {
                    return;
                }
                let request = {
                    scopes: loginRequest.scopes, // Replace with your required scopes
                    account
                }
                const tokenResponse = await instance.acquireTokenSilent(request)
                .catch(async error => {
                    if (error.errorCode === "interaction_required" ||
                        error.errorCode === "AADSTS160021") {
                        await instance.clearCache();
                        await instance.acquireTokenRedirect({ ...request, prompt: "select_account" });
                    }
                });

                if (tokenResponse) {
                    setToken(tokenResponse.accessToken);
                }
            } catch (error) {
                console.warn('Skipping token acquisition, MSAL not ready yet:', error);
            }
        };

        // Wait until MSAL has finished initializing/processing the redirect response
        // before touching the instance, otherwise getActiveAccount/acquireTokenSilent
        // throw uninitialized_public_client_application intermittently on mount.
        if (inProgress !== InteractionStatus.None) {
            return;
        }

        if (!token) {
            getAppToken();
        }

        if (token && context.selectedTenantGuid) {
            getAgentToken();
        }

    }, [token, accounts, instance, inProgress, context.selectedTenantGuid]);
    
    return token;
}