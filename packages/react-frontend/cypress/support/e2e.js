const API = "http://localhost:8000";
const TEST_EMAIL = "cypress-test@dynamicfit.test";
const TEST_PASSWORD = "CypressTest123!";

// Log in via API and store the token — faster than going through the UI every time
Cypress.Commands.add("loginViaApi", () => {
  // Try to register first; if the account already exists, just log in
  cy.request({
    method: "POST",
    url: `${API}/signup`,
    body: { email: TEST_EMAIL, pwd: TEST_PASSWORD },
    failOnStatusCode: false,
  }).then((signupRes) => {
    if (signupRes.status === 201) {
      window.localStorage.setItem("auth_token", signupRes.body.token);
    } else {
      cy.request({
        method: "POST",
        url: `${API}/login`,
        body: { email: TEST_EMAIL, pwd: TEST_PASSWORD },
      }).then((loginRes) => {
        window.localStorage.setItem("auth_token", loginRes.body.token);
      });
    }
  });
});
