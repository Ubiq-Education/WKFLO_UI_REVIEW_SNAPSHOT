import { getTenantGuid } from "@/lib/tenant-config";

export class JwtService {

    constructor(private apiEndpoint: string, private token: string) {
    }

    getJwtToken = async (tenantGuid: string): Promise<void> => {
        try {
            const response = await fetch(`${this.apiEndpoint}/ai/api/v1/tenant/jwt/token`, {
                method: "GET",
                mode: "cors",
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`,
                    'amais-wkflo-tenant-guid': tenantGuid
                }
            });

            const token = await response.json();
            localStorage.setItem('agent-token-' + tenantGuid, token.data);
            
        } catch (error) {
            console.error(`Failed to load JWT token`, error);
            throw error;
        }
    }
}
