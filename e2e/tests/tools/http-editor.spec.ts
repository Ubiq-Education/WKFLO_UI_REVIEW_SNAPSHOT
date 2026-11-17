import { expect, test } from "../../support/test";
import { HttpEditorPage } from "../../pages/tools/http-editor.page";
import { ToolFormPage } from "../../pages/tools/tool-form.page";
import { Toast } from "../../pages/components/toast";
import { HTTP_CONFIG, HTTP_INPUT_KEY, installToolsMocks, lastBody, mockTestToolRoute, TOOL_IDS, type ToolsStore } from "../../support/mocks/tools";

const TOOL_PATH = "/md/api/v1/tenant/tool/:id";

/** The config the last PUT to the tool endpoint carried, parsed. */
function savedConfig(mockApi: Parameters<typeof lastBody>[0]): Record<string, any> {
  return JSON.parse(lastBody<{ config: string }>(mockApi, "PUT", TOOL_PATH)!.config);
}

test.describe("HTTP editor", () => {
  let store: ToolsStore;
  test.beforeEach(({ mockApi }) => {
    store = installToolsMocks(mockApi);
  });

  /** Replaces the HTTP fixture tool's "query" input before the page loads. */
  function setQueryInput(fields: Record<string, unknown>) {
    const config = JSON.parse(store.tools[0].config);
    Object.assign(config.inputs[HTTP_INPUT_KEY], fields);
    store.tools[0].config = JSON.stringify(config);
  }

  test.describe("request config", () => {
    test("shows the saved method, URL, headers, parameters and body", async ({ page }) => {
      const form = new ToolFormPage(page);
      const http = new HttpEditorPage(page);
      await form.gotoEdit(TOOL_IDS.http);

      await expect(http.methodSelect).toHaveText("POST");
      await expect(http.urlInput).toHaveValue(HTTP_CONFIG.url);
      await expect(http.headerNames()).toHaveCount(2);
      await expect(http.headerNames().nth(1)).toHaveValue("X-E2E-Header");
      await expect(http.headerValues().nth(1)).toHaveValue("e2e-value");
      await expect(http.parameterNames()).toHaveCount(1);
      await expect(http.parameterNames().first()).toHaveValue("q");
      await expect(http.parameterValues().first()).toHaveValue("{{query}}");
      await expect(http.bodyInput).toHaveValue(HTTP_CONFIG.body);
    });

    test("a new tool starts as a GET with a JSON content type header and no body field", async ({ page }) => {
      const form = new ToolFormPage(page);
      const http = new HttpEditorPage(page);
      await form.gotoCreate();

      await expect(http.methodSelect).toHaveText("GET");
      await expect(http.urlInput).toHaveValue("");
      await expect(http.headerNames()).toHaveCount(1);
      await expect(http.headerNames().first()).toHaveValue("Content-Type");
      await expect(http.headerValues().first()).toHaveValue("application/json");
      await expect(http.parameterNames()).toHaveCount(0);
      await expect(http.bodyInput).toHaveCount(0);
    });

    test("the request body is offered for POST, PUT and PATCH only", async ({ page }) => {
      const form = new ToolFormPage(page);
      const http = new HttpEditorPage(page);
      await form.gotoCreate();

      for (const method of ["POST", "PUT", "PATCH"]) {
        await http.selectMethod(method);
        await expect(http.methodSelect).toHaveText(method);
        await expect(http.bodyInput).toBeVisible();
      }
      for (const method of ["GET", "DELETE"]) {
        await http.selectMethod(method);
        await expect(http.methodSelect).toHaveText(method);
        await expect(http.bodyInput).toHaveCount(0);
      }
    });

    test("editing every request field is saved in the tool's config", async ({ page, mockApi }) => {
      const form = new ToolFormPage(page);
      const http = new HttpEditorPage(page);
      const toast = new Toast(page);
      await form.gotoEdit(TOOL_IDS.http);

      await http.selectMethod("PUT");
      await http.urlInput.fill("https://example.test/api/records/{{query}}");
      await http.headerNames().nth(1).fill("X-E2E-Renamed");
      await http.headerValues().nth(1).fill("renamed-value");
      await http.parameterNames().first().fill("search");
      await http.parameterValues().first().fill("{{query}}&x=1");
      await http.bodyInput.fill('{"id":"{{query}}"}');
      await form.saveButton.click();

      await toast.expectShown("Tool updated");
      const config = savedConfig(mockApi);
      expect(config).toMatchObject({
        method: "PUT",
        url: "https://example.test/api/records/{{query}}",
        headers: { "Content-Type": "application/json", "X-E2E-Renamed": "renamed-value" },
        parameters: { search: "{{query}}&x=1" },
        body: '{"id":"{{query}}"}',
      });
      expect(config.headers).not.toHaveProperty("X-E2E-Header");
    });

    test("headers can be added and removed", async ({ page, mockApi }) => {
      const form = new ToolFormPage(page);
      const http = new HttpEditorPage(page);
      const toast = new Toast(page);
      await form.gotoEdit(TOOL_IDS.http);

      await http.addHeaderButton.click();
      // New headers are named after their position.
      await expect(http.headerNames()).toHaveCount(3);
      await expect(http.headerNames().nth(2)).toHaveValue("header_3");
      await http.headerNames().nth(2).fill("Accept");
      await http.headerValues().nth(2).fill("application/json");
      await page.getByRole("button", { name: "Remove header Content-Type" }).click();
      await expect(http.headerNames()).toHaveCount(2);
      await form.saveButton.click();

      await toast.expectShown("Tool updated");
      expect(savedConfig(mockApi).headers).toEqual({ "X-E2E-Header": "e2e-value", Accept: "application/json" });
    });

    test("parameters can be added and removed", async ({ page, mockApi }) => {
      const form = new ToolFormPage(page);
      const http = new HttpEditorPage(page);
      const toast = new Toast(page);
      await form.gotoEdit(TOOL_IDS.http);

      await http.addParameterButton.click();
      await expect(http.parameterNames()).toHaveCount(2);
      await expect(http.parameterNames().nth(1)).toHaveValue("param_2");
      await http.parameterNames().nth(1).fill("limit");
      await http.parameterValues().nth(1).fill("10");
      await page.getByRole("button", { name: "Remove parameter q" }).click();
      await expect(http.parameterNames()).toHaveCount(1);
      await form.saveButton.click();

      await toast.expectShown("Tool updated");
      expect(savedConfig(mockApi).parameters).toEqual({ limit: "10" });
    });

    test("using {{url}} in a parameter adds a URL input", async ({ page, mockApi }) => {
      const form = new ToolFormPage(page);
      const http = new HttpEditorPage(page);
      const toast = new Toast(page);
      await form.gotoEdit(TOOL_IDS.http);
      await expect(page.getByRole("heading", { level: 4, name: "URL", exact: true })).toHaveCount(0);

      await http.parameterValues().first().fill("{{url}}");

      await expect(page.getByRole("heading", { level: 4, name: "URL", exact: true })).toBeVisible();
      await form.saveButton.click();
      await toast.expectShown("Tool updated");
      expect(savedConfig(mockApi).inputs.url).toMatchObject({ name: "URL", type: "string", required: false });
    });
  });

  test.describe("inputs", () => {
    test("shows the saved input with its type and description", async ({ page }) => {
      const form = new ToolFormPage(page);
      const http = new HttpEditorPage(page);
      await form.gotoEdit(TOOL_IDS.http);

      const row = http.inputRow("Query");
      await expect(row).toContainText("string");
      await expect(row).toContainText("Text to look up");
      // The settings stay closed until Edit is clicked.
      await expect(page.getByPlaceholder("e.g., Name, URL, Query", { exact: true })).toHaveCount(0);
    });

    test("Add Input opens a new input's settings, and editing them is saved", async ({ page, mockApi }) => {
      const form = new ToolFormPage(page);
      const http = new HttpEditorPage(page);
      const toast = new Toast(page);
      await form.gotoEdit(TOOL_IDS.http);

      await http.addInputButton.click();
      const row = http.inputRow("New Input");
      await expect(row).toBeVisible();
      await expect(row.getByPlaceholder("e.g., Name, URL, Query", { exact: true })).toHaveValue("New Input");

      await row.getByPlaceholder("e.g., Name, URL, Query", { exact: true }).fill("City Name");
      // The row is found by its heading, which now shows the new name.
      const renamed = http.inputRow("City Name");
      await renamed.getByPlaceholder("e.g., name, url, query", { exact: true }).fill("City Name");
      await renamed.getByPlaceholder("Description of what this input is for").fill("The city to search in");
      await renamed.getByRole("combobox", { name: "Input type" }).click();
      await page.getByRole("option", { name: "Number", exact: true }).click();
      await expect(renamed.getByRole("switch", { name: "Input required" })).toBeChecked();
      await renamed.getByRole("switch", { name: "Input required" }).click();
      await expect(renamed).toContainText("Optional");
      await renamed.getByRole("button", { name: "Done" }).click();
      await expect(renamed.getByPlaceholder("e.g., Name, URL, Query", { exact: true })).toHaveCount(0);
      await form.saveButton.click();

      await toast.expectShown("Tool updated");
      // The variable name is the input's key: lower case, spaces become underscores.
      expect(savedConfig(mockApi).inputs.city_name).toMatchObject({
        name: "City Name",
        description: "The city to search in",
        type: "number",
        required: false,
      });
      expect(Object.keys(savedConfig(mockApi).inputs)).toEqual([HTTP_INPUT_KEY, "city_name"]);
    });

    test("an input can carry a default value", async ({ page, mockApi }) => {
      const form = new ToolFormPage(page);
      const http = new HttpEditorPage(page);
      const toast = new Toast(page);
      await form.gotoEdit(TOOL_IDS.http);

      await http.inputRow("Query").getByRole("button", { name: "Edit" }).click();
      const row = http.inputRow("Query");
      await row.getByPlaceholder("Enter value for this input").fill("records");
      await row.getByRole("switch", { name: "Set Query as default" }).click();
      await expect(row.getByText("This value will be used as the default when not specified")).toBeVisible();
      await form.saveButton.click();

      await toast.expectShown("Tool updated");
      expect(savedConfig(mockApi).inputs[HTTP_INPUT_KEY]).toMatchObject({ value: "records", defaultValue: "records", hasDefaultValue: true });
    });

    test("inputs can be reordered, and the first and last moves are disabled", async ({ page, mockApi }) => {
      const form = new ToolFormPage(page);
      const http = new HttpEditorPage(page);
      const toast = new Toast(page);
      await form.gotoEdit(TOOL_IDS.http);
      await http.addInputButton.click();
      await expect(http.inputRow("New Input")).toBeVisible();

      await expect(page.getByRole("button", { name: "Move Query up" })).toBeDisabled();
      await expect(page.getByRole("button", { name: "Move New Input down" })).toBeDisabled();
      await page.getByRole("button", { name: "Move New Input up" }).click();
      await expect(page.getByRole("button", { name: "Move New Input up" })).toBeDisabled();
      await expect(page.getByRole("button", { name: "Move Query down" })).toBeDisabled();
      await form.saveButton.click();

      await toast.expectShown("Tool updated");
      const keys = Object.keys(savedConfig(mockApi).inputs);
      expect(keys).toHaveLength(2);
      expect(keys[1]).toBe(HTTP_INPUT_KEY);
    });

    test("an input can be removed", async ({ page, mockApi }) => {
      const form = new ToolFormPage(page);
      const http = new HttpEditorPage(page);
      const toast = new Toast(page);
      await form.gotoEdit(TOOL_IDS.http);

      await page.getByRole("button", { name: "Remove input Query" }).click();

      await expect(page.getByRole("heading", { level: 4, name: "Query", exact: true })).toHaveCount(0);
      await form.saveButton.click();
      await toast.expectShown("Tool updated");
      expect(savedConfig(mockApi).inputs).toEqual({});
      await expect(http.addInputButton).toBeVisible();
    });
  });

  test.describe("variable suggestions", () => {
    test.use({ clipboardPermission: true });

    test("typing {{ in the URL field lists the inputs and the secrets", async ({ page }) => {
      const form = new ToolFormPage(page);
      const http = new HttpEditorPage(page);
      await form.gotoEdit(TOOL_IDS.http);

      await http.urlInput.pressSequentially("{{");

      await expect(http.variablesToast).toBeVisible();
      await expect(http.variablesToast).toContainText("Input Variables:");
      await expect(http.variablesToast.getByText("{{query}}", { exact: true })).toBeVisible();
      await expect(http.variablesToast).toContainText("Secrets:");
      await expect(http.variablesToast.getByText("{{secrets_E2E API Key}}", { exact: true })).toBeVisible();
      await expect(http.variablesToast).toContainText("Click a variable to copy it to your clipboard");
    });

    test("a single { already opens the toast", async ({ page }) => {
      const form = new ToolFormPage(page);
      const http = new HttpEditorPage(page);
      await form.gotoEdit(TOOL_IDS.http);

      await http.urlInput.press("{");

      // Known bug: see US 8186 item 50 (use-variable-suggestions.tsx checks only that the character before the
      // cursor is "{", which the typed "{" itself satisfies, so one brace is enough, not "{{").
      await expect(http.variablesToast).toBeVisible();
    });

    test("typing ordinary characters does not open the toast", async ({ page }) => {
      const form = new ToolFormPage(page);
      const http = new HttpEditorPage(page);
      await form.gotoEdit(TOOL_IDS.http);

      await http.urlInput.press("End");
      await http.urlInput.press("a");
      await http.urlInput.press("}");

      await expect(http.urlInput).toHaveValue(`${HTTP_CONFIG.url}a}`);
      // Let React render anything the keyups would have triggered (two frames), so the absence below is not just "too early".
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      await expect(http.variablesToast).toHaveCount(0);
      // The listener is alive: the next brace does open the toast.
      await http.urlInput.press("{");
      await expect(http.variablesToast).toBeVisible();
    });

    test("the variables button opens the same toast", async ({ page }) => {
      const form = new ToolFormPage(page);
      const http = new HttpEditorPage(page);
      await form.gotoEdit(TOOL_IDS.http);

      await http.variablesButton.click();

      await expect(http.variablesToast.getByText("{{query}}", { exact: true })).toBeVisible();
    });

    test("clicking a variable copies it and confirms with a toast", async ({ page }) => {
      const form = new ToolFormPage(page);
      const http = new HttpEditorPage(page);
      const toast = new Toast(page);
      await form.gotoEdit(TOOL_IDS.http);
      await http.variablesButton.click();

      await http.variablesToast.getByText("{{query}}", { exact: true }).click();

      await toast.expectShown("{{query}} has been copied to your clipboard");
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("{{query}}");

      await http.variablesButton.click();
      await http.variablesToast.getByText("{{secrets_E2E API Key}}", { exact: true }).click();
      await toast.expectShown("{{secrets_E2E API Key}} has been copied to your clipboard");
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("{{secrets_E2E API Key}}");
    });

    test("the toast says so when there are no inputs and no secrets", async ({ page, mockApi }) => {
      mockApi.seed.secrets.splice(0);
      const form = new ToolFormPage(page);
      const http = new HttpEditorPage(page);
      await form.gotoCreate();

      await http.variablesButton.click();

      await expect(http.variablesToast).toContainText("No variables available. Add inputs to create variables.");
      await expect(http.variablesToast).not.toContainText("Input Variables:");
      await expect(http.variablesToast).not.toContainText("Secrets:");
    });

    test("typing {{ in another tool type's field opens the toast too", async ({ page }) => {
      const form = new ToolFormPage(page);
      const http = new HttpEditorPage(page);
      await form.gotoEdit(TOOL_IDS.contactForm);

      await page.getByPlaceholder(/^Show the contact form when/).pressSequentially("{{");

      // The listener is installed by the form for every type; a Contact Form has no inputs, so only secrets are listed.
      await expect(http.variablesToast).toContainText("Secrets:");
      await expect(http.variablesToast).not.toContainText("Input Variables:");
    });
  });

  // These tests exercise the UI against its own ApiTestResponse contract (tool-form.types.ts). `/md/api/v1/test-tool`
  // has no backend in wkflo_services (Known bug: see US 8186 item 51), so a mocked route stands in for it. They are
  // not proof that Run tool works when deployed.
  test.describe("Test API tab (against the editor's own ApiTestResponse contract)", () => {
    test("shows the tool's name and one field per input", async ({ page }) => {
      const form = new ToolFormPage(page);
      const http = new HttpEditorPage(page);
      await form.gotoEdit(TOOL_IDS.http);

      await http.testTab.click();

      await expect(page.getByRole("heading", { level: 3, name: "E2E Lookup Tool API Call" })).toBeVisible();
      await expect(page.getByRole("tabpanel", { name: "Test API" }).getByText("Looks up a record over HTTP.", { exact: true })).toBeVisible();
      await expect(http.testInput("Query")).toBeVisible();
      await expect(page.getByRole("tabpanel", { name: "Test API" }).getByText("Text to look up", { exact: true })).toBeVisible();
      await expect(http.runButton).toBeEnabled();
      // Nothing has run yet.
      await expect(page.getByRole("tab", { name: "Tool Output" })).toHaveCount(0);
    });

    test("Run tool posts the request with the typed input values and shows the response", async ({ page }) => {
      const test = await mockTestToolRoute(page, { status: 200, duration: 42, data: { records: [{ id: 7 }] } });
      const form = new ToolFormPage(page);
      const http = new HttpEditorPage(page);
      await form.gotoEdit(TOOL_IDS.http);
      await http.testTab.click();
      await http.testInput("Query").fill("e2e search");

      await http.runButton.click();

      await expect(page.getByRole("tab", { name: "Tool Output" })).toBeVisible();
      await expect(page.locator("pre")).toContainText('"records"');
      expect(test.requests).toHaveLength(1);
      expect(test.requests[0]).toMatchObject({
        method: "POST",
        url: HTTP_CONFIG.url,
        headers: HTTP_CONFIG.headers,
        parameters: { q: "{{query}}" },
        urlParams: {},
        body: HTTP_CONFIG.body,
      });
      expect(test.requests[0].inputs[HTTP_INPUT_KEY].value).toBe("e2e search");
      // Editing happens on the structured tab, so the run uses what is in the form without saving it.
      await expect(page.getByRole("button", { name: "Save Tool" })).toBeEnabled();
    });

    test("the Status tab shows the upstream status code, the time and success", async ({ page }) => {
      await mockTestToolRoute(page, { status: 200, duration: 42, data: { ok: true } });
      const form = new ToolFormPage(page);
      const http = new HttpEditorPage(page);
      await form.gotoEdit(TOOL_IDS.http);
      await http.testTab.click();
      await http.runButton.click();

      await page.getByRole("tab", { name: "Status" }).click();

      const panel = page.getByRole("tabpanel", { name: "Status" });
      await expect(panel).toContainText("Status Code");
      await expect(panel).toContainText("200");
      await expect(panel).toContainText("Response Time");
      await expect(panel).toContainText("42ms");
      await expect(panel.getByText("Yes", { exact: true })).toBeVisible();
    });

    test("an upstream error status is shown as not successful", async ({ page }) => {
      await mockTestToolRoute(page, { status: 500, data: { message: "Upstream failed" } });
      const form = new ToolFormPage(page);
      const http = new HttpEditorPage(page);
      await form.gotoEdit(TOOL_IDS.http);
      await http.testTab.click();
      await http.runButton.click();

      await page.getByRole("tab", { name: "Status" }).click();

      const panel = page.getByRole("tabpanel", { name: "Status" });
      await expect(panel).toContainText("500");
      await expect(panel.getByText("No", { exact: true })).toBeVisible();
      await expect(panel).not.toContainText("Response Time");
    });

    test("an empty test field falls back to the saved default value", async ({ page }) => {
      setQueryInput({ value: "", defaultValue: "fallback", hasDefaultValue: true });
      const test = await mockTestToolRoute(page, { status: 200, data: {} });
      const form = new ToolFormPage(page);
      const http = new HttpEditorPage(page);
      await form.gotoEdit(TOOL_IDS.http);
      await http.testTab.click();
      // The test field starts with the default value; clearing it must bring the fallback back at run time.
      await expect(http.testInput("Query")).toHaveValue("fallback");
      await http.testInput("Query").fill("");

      await http.runButton.click();

      await expect.poll(() => test.requests.length).toBe(1);
      expect(test.requests[0].inputs[HTTP_INPUT_KEY]).toMatchObject({ value: "fallback", defaultValue: "fallback", hasDefaultValue: true });
    });

    test("a default value that is not switched on is not used for an empty test field", async ({ page }) => {
      setQueryInput({ value: "", defaultValue: "unused", hasDefaultValue: false });
      const test = await mockTestToolRoute(page, { status: 200, data: {} });
      const form = new ToolFormPage(page);
      const http = new HttpEditorPage(page);
      await form.gotoEdit(TOOL_IDS.http);
      await http.testTab.click();
      await http.testInput("Query").fill("");

      await http.runButton.click();

      await expect.poll(() => test.requests.length).toBe(1);
      expect(test.requests[0].inputs[HTTP_INPUT_KEY].value).toBe("");
    });

    test("an empty input with no default is sent with an empty value", async ({ page }) => {
      const test = await mockTestToolRoute(page, { status: 200, data: {} });
      const form = new ToolFormPage(page);
      const http = new HttpEditorPage(page);
      await form.gotoEdit(TOOL_IDS.http);
      await http.testTab.click();

      await http.runButton.click();

      await expect.poll(() => test.requests.length).toBe(1);
      expect(test.requests[0].inputs[HTTP_INPUT_KEY].value).toBe("");
    });

    test("the button shows Testing... and is disabled while the request runs", async ({ page }) => {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      await page.route(
        (url) => url.pathname === "/md/api/v1/test-tool",
        async (route) => {
          await gate;
          await route.fulfill({ status: 200, json: { status: 200, data: { done: true } } });
        },
      );
      const form = new ToolFormPage(page);
      const http = new HttpEditorPage(page);
      await form.gotoEdit(TOOL_IDS.http);
      await http.testTab.click();

      await http.runButton.click();

      const running = page.getByRole("button", { name: "Testing..." });
      await expect(running).toBeDisabled();
      release();
      await expect(http.runButton).toBeEnabled();
      await expect(page.locator("pre")).toContainText('"done"');
    });

    test.describe("with clipboard access", () => {
      test.use({ clipboardPermission: true });

      test("Formatted copies the response data", async ({ page }) => {
        await mockTestToolRoute(page, { status: 200, data: { records: [{ id: 7 }] } });
        const form = new ToolFormPage(page);
        const http = new HttpEditorPage(page);
        const toast = new Toast(page);
        await form.gotoEdit(TOOL_IDS.http);
        await http.testTab.click();
        await http.runButton.click();

        await page.getByRole("button", { name: "Formatted" }).click();

        await toast.expectShown("Copied to clipboard");
        const copied = await page.evaluate(() => navigator.clipboard.readText());
        expect(JSON.parse(copied)).toEqual({ records: [{ id: 7 }] });
      });
    });

    test.describe("when the request fails", () => {
      test.use({ allowedConsoleErrors: [/Error testing API|Failed to load resource/] });

      test("a network failure is shown as an error result", async ({ page }) => {
        await page.route(
          (url) => url.pathname === "/md/api/v1/test-tool",
          (route) => route.abort("connectionrefused"),
        );
        const form = new ToolFormPage(page);
        const http = new HttpEditorPage(page);
        await form.gotoEdit(TOOL_IDS.http);
        await http.testTab.click();

        await http.runButton.click();

        await expect(page.locator("pre")).toContainText('"success": false');
        await expect(page.locator("pre")).toContainText('"error": "Failed to fetch"');
        await expect(http.runButton).toBeEnabled();
      });

      test("without a route behind it the run ends in an error result", async ({ page }) => {
        const form = new ToolFormPage(page);
        const http = new HttpEditorPage(page);
        await form.gotoEdit(TOOL_IDS.http);
        await http.testTab.click();

        const response = page.waitForResponse((res) => new URL(res.url()).pathname === "/md/api/v1/test-tool");
        await http.runButton.click();
        await response;

        // Known bug: see US 8186 item 51 (the editor posts to the app's own origin; wkflo_services has no
        // test-tool endpoint, so there is nothing to run the request). The run never produces a tool output.
        await expect(page.locator("pre")).toContainText('"success": false');
        await expect(http.runButton).toBeEnabled();
      });
    });
  });
});
