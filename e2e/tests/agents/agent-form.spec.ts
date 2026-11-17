import { expect, test } from "../../support/test";
import { reply } from "../../support/mock-api";
import { AgentFormPage } from "../../pages/agents/agent-form.page";
import { Toast } from "../../pages/components/toast";
import { installAgentsMocks } from "../../support/mocks/agents";

const VALID = {
  name: "E2E New Agent",
  description: "Handles incoming requests.",
  systemPrompt: "You answer incoming requests politely.",
};

test.describe("Create agent", () => {
  test.beforeEach(({ mockApi }) => installAgentsMocks(mockApi));

  test("shows the empty form with its fields and switches off", async ({ page }) => {
    await page.goto("/agents/create");
    const form = new AgentFormPage(page);

    await expect(page.getByRole("heading", { name: "Create New Agent" })).toBeVisible();
    await expect(form.name).toHaveValue("");
    await expect(form.description).toHaveValue("");
    await expect(form.systemPrompt).toHaveValue("");
    await expect(form.aiModel).toContainText("Select a model");
    await expect(form.stmSwitch).not.toBeChecked();
    await expect(form.ltmSwitch).not.toBeChecked();
    await expect(form.spinUpSwitch).not.toBeChecked();
    // Additional instructions are only sent from the edit page.
    await expect(form.additionalInstructions).toHaveCount(0);
  });

  test("Back and Cancel return to the agents list", async ({ page }) => {
    await page.goto("/agents/create");
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page).toHaveURL((url) => url.pathname === "/agents");

    await page.goto("/agents/create");
    await new AgentFormPage(page).cancelButton.click();
    await expect(page).toHaveURL((url) => url.pathname === "/agents");
  });

  test("an empty submit shows every required-field message and sends nothing", async ({ page, mockApi }) => {
    await page.goto("/agents/create");
    const form = new AgentFormPage(page);
    await form.submitButton("Create Agent").click();

    await expect(form.message("Name must be at least 3 characters")).toBeVisible();
    await expect(form.message("Description must be at least 10 characters")).toBeVisible();
    await expect(form.message("System prompt must be at least 20 characters")).toBeVisible();
    expect(mockApi.requestsTo("POST", "/md/api/v1/tenant/agent")).toHaveLength(0);
  });

  test("values just under each minimum are rejected, and the messages clear at the minimum", async ({ page, mockApi }) => {
    await page.goto("/agents/create");
    const form = new AgentFormPage(page);

    await form.name.fill("ab");
    await form.description.fill("123456789");
    await form.systemPrompt.fill("1234567890123456789");
    await form.submitButton("Create Agent").click();
    await expect(form.message("Name must be at least 3 characters")).toBeVisible();
    await expect(form.message("Description must be at least 10 characters")).toBeVisible();
    await expect(form.message("System prompt must be at least 20 characters")).toBeVisible();

    await form.name.fill("abc");
    await form.description.fill("1234567890");
    await form.systemPrompt.fill("12345678901234567890");
    await expect(form.message("Name must be at least 3 characters")).toHaveCount(0);
    await expect(form.message("Description must be at least 10 characters")).toHaveCount(0);
    await expect(form.message("System prompt must be at least 20 characters")).toHaveCount(0);
    expect(mockApi.requestsTo("POST", "/md/api/v1/tenant/agent")).toHaveLength(0);
  });

  test("the AI model select lists the tenant's models", async ({ page, mockApi }) => {
    await page.goto("/agents/create");
    const form = new AgentFormPage(page);
    await form.aiModel.click();

    await expect(page.getByRole("option", { name: mockApi.seed.aiModels[0].name })).toBeVisible();
  });

  test("creating an agent posts the form values, shows a toast and returns to the list", async ({ page, mockApi }) => {
    await page.goto("/agents/create");
    const form = new AgentFormPage(page);
    await form.fill({ ...VALID, model: "E2E Model" });
    await form.stmSwitch.click();
    await form.spinUpSwitch.click();
    await form.submitButton("Create Agent").click();

    await new Toast(page).expectShown("Agent created");
    await expect(page).toHaveURL((url) => url.pathname === "/agents");
    const [post] = mockApi.requestsTo("POST", "/md/api/v1/tenant/agent");
    expect(post.body).toEqual({
      ...VALID,
      aiModelId: 1,
      enableSTM: true,
      enableLTM: false,
      enableSpinUpAgents: true,
    });
    // The list is refetched, so the new agent is on it.
    await expect(page.getByRole("heading", { level: 3, name: VALID.name })).toBeVisible();
  });

  test.describe("server error", () => {
    test.use({ allowedConsoleErrors: [/Failed to load resource: the server responded with a status of 500/] });

    test("shows an error toast and stays on the form", async ({ page, mockApi }) => {
      mockApi.on("POST", "/md/api/v1/tenant/agent", () => reply({ message: "Boom" }, 500));
      await page.goto("/agents/create");
      const form = new AgentFormPage(page);
      await form.fill(VALID);
      await form.submitButton("Create Agent").click();

      await new Toast(page).expectShown("Failed to create agent");
      await expect(page).toHaveURL((url) => url.pathname === "/agents/create");
      await expect(form.name).toHaveValue(VALID.name);
      expect(mockApi.seed.agents.some((agent) => agent.name === VALID.name)).toBe(false);
      // Known bug: see US 8186. After a failed create the button stays "Saving..." and disabled
      // because create.tsx never resets isSaving; the user has to reload to retry.
      await expect(form.submitButton("Saving...")).toBeDisabled();
      await expect(form.submitButton("Create Agent")).toHaveCount(0);
    });
  });
});

test.describe("Tool slash menu", () => {
  test.beforeEach(({ mockApi }) => installAgentsMocks(mockApi));

  test("typing / lists the tools and picking one inserts its reference", async ({ page, mockApi }) => {
    const tool = mockApi.seed.tools[0];
    await page.goto("/agents/create");
    const form = new AgentFormPage(page);
    await form.typeInSystemPrompt("Use the tool /");

    await expect(form.toolMenuHint).toBeVisible();
    await form.toolMenuItem(tool.name).click();

    await expect(form.systemPrompt).toHaveValue(`Use the tool {{tool:${tool.id}:${tool.name}}}`);
    await expect(form.toolMenuHint).toHaveCount(0);
  });

  test("text after / filters the menu and a non-matching search shows a message", async ({ page, mockApi }) => {
    const tool = mockApi.seed.tools[0];
    await page.goto("/agents/create");
    const form = new AgentFormPage(page);

    await form.typeInSystemPrompt("/look");
    await expect(page.getByText("Search: look")).toBeVisible();
    await expect(page.getByText(tool.name, { exact: true })).toBeVisible();

    await form.systemPrompt.pressSequentially("zzz");
    await expect(page.getByText('No tools match "lookzzz"')).toBeVisible();
    await expect(page.getByText(tool.name, { exact: true })).toHaveCount(0);
  });

  test("the inserted reference is saved in the system prompt", async ({ page, mockApi }) => {
    const tool = mockApi.seed.tools[0];
    await page.goto("/agents/create");
    const form = new AgentFormPage(page);
    await form.name.fill(VALID.name);
    await form.description.fill(VALID.description);
    await form.typeInSystemPrompt("Please call /");
    await form.toolMenuItem(tool.name).click();
    await form.systemPrompt.pressSequentially(" whenever asked.");
    await form.submitButton("Create Agent").click();

    await new Toast(page).expectShown("Agent created");
    const [post] = mockApi.requestsTo("POST", "/md/api/v1/tenant/agent");
    expect((post.body as { systemPrompt: string }).systemPrompt).toBe(
      `Please call {{tool:${tool.id}:${tool.name}}} whenever asked.`,
    );
  });
});

test.describe("Edit agent", () => {
  test.beforeEach(({ mockApi }) => installAgentsMocks(mockApi));

  test("loads the agent's values into the form", async ({ page, mockApi }) => {
    const agent = mockApi.seed.agents[1];
    await page.goto("/agents/2/edit");
    const form = new AgentFormPage(page);

    await expect(page.getByRole("heading", { name: "Edit Agent" })).toBeVisible();
    await form.expectValues({ name: agent.name, description: agent.description, systemPrompt: agent.systemPrompt });
    await expect(form.aiModel).toContainText("E2E Model");
    await expect(form.additionalInstructions).toHaveValue("");
    await expect(page.getByText("(0/2000)")).toBeVisible();
    await expect(form.stmSwitch).toBeChecked();
    await expect(form.ltmSwitch).not.toBeChecked();
    await expect(form.spinUpSwitch).not.toBeChecked();
  });

  test.describe("unknown agent", () => {
    test.use({ allowedConsoleErrors: [/Failed to load resource: the server responded with a status of 404/] });

    test("shows a not-found message", async ({ page }) => {
      await page.goto("/agents/999/edit");

      await expect(page.getByRole("heading", { name: "Agent not found" })).toBeVisible();
    });
  });

  test("saving PUTs the changed values, shows a toast and opens the view page", async ({ page, mockApi }) => {
    await page.goto("/agents/1/edit");
    const form = new AgentFormPage(page);
    await expect(form.name).toHaveValue("E2E Support Agent");

    await form.name.fill("E2E Renamed Agent");
    await form.additionalInstructions.fill("Always answer in one paragraph.");
    await form.ltmSwitch.click();
    await form.submitButton("Save Changes").click();

    await new Toast(page).expectShown("Agent updated");
    await expect(page).toHaveURL((url) => url.pathname === "/agents/view/1");
    await expect(page.getByRole("heading", { level: 1, name: "E2E Renamed Agent" })).toBeVisible();
    const [put] = mockApi.requestsTo("PUT", "/md/api/v1/tenant/agent/:id");
    expect(put.path).toBe("/md/api/v1/tenant/agent/1");
    expect(put.body).toMatchObject({
      name: "E2E Renamed Agent",
      description: "Answers common questions.",
      systemPrompt: "You are a helpful assistant.",
      additionalInstructions: "Always answer in one paragraph.",
      aiModelId: 1,
      enableSTM: false,
      enableLTM: true,
      enableSpinUpAgents: false,
    });
    expect(put.body).not.toHaveProperty("tools");
  });

  test("validates name, description, system prompt and the 2000 character limit on additional instructions", async ({ page, mockApi }) => {
    await page.goto("/agents/1/edit");
    const form = new AgentFormPage(page);
    await expect(form.name).toHaveValue("E2E Support Agent");

    await form.name.fill("ab");
    await form.description.fill("too short");
    await form.systemPrompt.fill("too short prompt");
    await form.submitButton("Save Changes").click();
    await expect(form.message("Name must be at least 3 characters")).toBeVisible();
    await expect(form.message("Description must be at least 10 characters")).toBeVisible();
    await expect(form.message("System prompt must be at least 20 characters")).toBeVisible();

    // The textarea's maxLength stops typing at 2000, so the counter shows the limit.
    await form.additionalInstructions.fill("x".repeat(2100));
    await expect(form.additionalInstructions).toHaveValue("x".repeat(2000));
    await expect(page.getByText("(2000/2000)")).toBeVisible();
    expect(mockApi.requestsTo("PUT", "/md/api/v1/tenant/agent/:id")).toHaveLength(0);
  });

  test.describe("server error", () => {
    test.use({ allowedConsoleErrors: [/Failed to load resource: the server responded with a status of 500/] });

    test("shows an error toast, stays on the page and lets the user retry", async ({ page, mockApi }) => {
      mockApi.on("PUT", "/md/api/v1/tenant/agent/:id", () => reply({ message: "Boom" }, 500));
      await page.goto("/agents/1/edit");
      const form = new AgentFormPage(page);
      await expect(form.name).toHaveValue("E2E Support Agent");
      await form.name.fill("E2E Renamed Agent");
      await form.submitButton("Save Changes").click();

      await new Toast(page).expectShown("Failed to update agent");
      await expect(page).toHaveURL((url) => url.pathname === "/agents/1/edit");
      // Unlike create, the edit page resets its saving state, so the button is usable again.
      await expect(form.submitButton("Save Changes")).toBeEnabled();
    });
  });

  test("Cancel returns to the agents list without saving", async ({ page, mockApi }) => {
    await page.goto("/agents/1/edit");
    const form = new AgentFormPage(page);
    await expect(form.name).toHaveValue("E2E Support Agent");
    await form.name.fill("Changed but cancelled");
    await form.cancelButton.click();

    await expect(page).toHaveURL((url) => url.pathname === "/agents");
    expect(mockApi.requestsTo("PUT", "/md/api/v1/tenant/agent/:id")).toHaveLength(0);
  });
});
