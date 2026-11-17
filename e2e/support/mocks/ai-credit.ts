import type { MockApi, MockRequest } from "../mock-api";
import { errorReply, installAiModelsMocks, type AiModelsStore } from "./ai-models";

/**
 * Mocks for the AI Credit page, following the real MD API (wkflo_services/AMAIS_WKFLO_MD_API,
 * Application/AICredits and WebAPI/EndPoints/AICredits):
 *
 * - `GET /ai-model/:id/ai-credit` answers HTTP 404 (bare NotFoundResult, empty `errors`) when the model has no
 *   credit: the page treats exactly that as "create mode". It does not check that the model exists.
 * - AICredit has a global `!IsDeleted` query filter, so after a delete the GET is a 404 again (create mode).
 * - `totalCost` and `credits` are SQL computed columns rounded to two decimals (AICreditConfiguration):
 *   totalCost = costIn + costOut, credits = tokensIn * multiplierIn / 1000 + tokensOut * multiplierOut / 1000.
 * - Create: the validators check multipliers > 0 (`WKFLOMD1406`, property `MultiplierIn` / `MultiplierOut`),
 *   tokens >= 0 (`1407`), costs >= 0 (`1408`), then that the model exists (`1405`) and has no credit yet
 *   (`1404`), both under the property `AIModelId`. [Required] on the value-type fields never fails.
 * - Update: `1402` (property `AICredit`) when the credit is missing or deleted, then the same value rules, `1405`
 *   and `1404` (another live credit for the model). Delete of a missing credit fails `1402` too.
 * - Success is HTTP 200 `{ data }`; delete returns `{ id }`.
 * The model, secret and tag endpoints come from `installAiModelsMocks`.
 */

export interface StoredCredit {
  id: number;
  aiModelId: number;
  tokensIn: number;
  costInMTok: number;
  tokensOut: number;
  costOutMTok: number;
  totalCost: number;
  multiplierIn: number;
  multiplierOut: number;
  credits: number;
  isDeleted: boolean;
  createdOn: string;
  lastUpdatedOn: string | null;
}

export interface AiCreditStore extends AiModelsStore {
  credits: StoredCredit[];
}

const round2 = (value: number) => Math.round(value * 100) / 100;

function computed(input: { tokensIn: number; costInMTok: number; tokensOut: number; costOutMTok: number; multiplierIn: number; multiplierOut: number }) {
  return {
    totalCost: round2(input.costInMTok + input.costOutMTok),
    credits: round2((input.tokensIn * input.multiplierIn) / 1000 + (input.tokensOut * input.multiplierOut) / 1000),
  };
}

/** Model 1 has a credit configuration, models 2 and 3 have none. */
export function createCreditFixtures(): StoredCredit[] {
  const values = { tokensIn: 1000, costInMTok: 1.5, tokensOut: 2000, costOutMTok: 3, multiplierIn: 1, multiplierOut: 2 };
  return [{ id: 1, aiModelId: 1, ...values, ...computed(values), isDeleted: false, createdOn: "2026-01-15T09:00:00Z", lastUpdatedOn: null }];
}

type Body = { aiModelId: number; tokensIn: number; costInMTok: number; tokensOut: number; costOutMTok: number; multiplierIn: number; multiplierOut: number };

/** Value rules shared by CreateAICreditCommandValidator and UpdateAICreditCommandValidator, in rule order. */
function valueErrors(input: Body): Array<[string, string]> {
  const errors: Array<[string, string]> = [];
  if (!(input.multiplierIn > 0)) errors.push(["MultiplierIn", "WKFLOMD1406"]);
  if (!(input.multiplierOut > 0)) errors.push(["MultiplierOut", "WKFLOMD1406"]);
  if (!(input.tokensIn >= 0)) errors.push(["TokensIn", "WKFLOMD1407"]);
  if (!(input.tokensOut >= 0)) errors.push(["TokensOut", "WKFLOMD1407"]);
  if (!(input.costInMTok >= 0)) errors.push(["CostInMTok", "WKFLOMD1408"]);
  if (!(input.costOutMTok >= 0)) errors.push(["CostOutMTok", "WKFLOMD1408"]);
  return errors;
}

export function installAiCreditMocks(mockApi: MockApi, options: { credits?: StoredCredit[] } = {}): AiCreditStore {
  const store = installAiModelsMocks(mockApi);
  const credits = options.credits ?? createCreditFixtures();
  let tick = 0;
  const now = () => new Date(Date.UTC(2026, 2, 1, 10, tick++, 0)).toISOString();
  const liveForModel = (modelId: number) => credits.find((credit) => credit.aiModelId === modelId && !credit.isDeleted);
  const liveById = (id: string) => credits.find((credit) => String(credit.id) === id && !credit.isDeleted);
  const modelExists = (modelId: number) => store.models.some((model) => model.id === modelId && !model.isDeleted);

  mockApi.on("GET", "/md/api/v1/ai-model/:id/ai-credit", ({ params }) => liveForModel(Number(params.id)) ?? errorReply(404));

  mockApi.on("POST", "/md/api/v1/ai-credit", ({ body }: MockRequest) => {
    const input = body as Body;
    const errors = valueErrors(input);
    if (!modelExists(input.aiModelId)) errors.push(["AIModelId", "WKFLOMD1405"]);
    if (liveForModel(input.aiModelId)) errors.push(["AIModelId", "WKFLOMD1404"]);
    if (errors.length > 0) return errorReply(400, ...errors);
    const credit: StoredCredit = {
      id: credits.reduce((max, item) => Math.max(max, item.id), 0) + 1,
      aiModelId: input.aiModelId,
      tokensIn: input.tokensIn,
      costInMTok: input.costInMTok,
      tokensOut: input.tokensOut,
      costOutMTok: input.costOutMTok,
      multiplierIn: input.multiplierIn,
      multiplierOut: input.multiplierOut,
      ...computed(input),
      isDeleted: false,
      createdOn: now(),
      lastUpdatedOn: null,
    };
    credits.push(credit);
    return credit;
  });

  mockApi.on("PUT", "/md/api/v1/ai-credit/:id", ({ params, body }: MockRequest) => {
    const input = body as Body;
    const credit = liveById(params.id);
    const errors: Array<[string, string]> = [];
    if (!credit) errors.push(["AICredit", "WKFLOMD1402"]);
    errors.push(...valueErrors(input));
    if (!modelExists(input.aiModelId)) errors.push(["AIModelId", "WKFLOMD1405"]);
    if (credits.some((item) => item.aiModelId === input.aiModelId && String(item.id) !== params.id && !item.isDeleted)) {
      errors.push(["AIModelId", "WKFLOMD1404"]);
    }
    if (errors.length > 0 || !credit) return errorReply(400, ...errors);
    Object.assign(credit, {
      aiModelId: input.aiModelId,
      tokensIn: input.tokensIn,
      costInMTok: input.costInMTok,
      tokensOut: input.tokensOut,
      costOutMTok: input.costOutMTok,
      multiplierIn: input.multiplierIn,
      multiplierOut: input.multiplierOut,
      ...computed(input),
      lastUpdatedOn: now(),
    });
    return credit;
  });

  mockApi.on("DELETE", "/md/api/v1/ai-credit/:id", ({ params }) => {
    const credit = liveById(params.id);
    if (!credit) return errorReply(400, ["AICredit", "WKFLOMD1402"]);
    credit.isDeleted = true;
    return { id: credit.id };
  });

  return { ...store, credits };
}
