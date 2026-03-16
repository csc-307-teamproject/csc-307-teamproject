// DynamicFit — end-to-end happy-path tests
// Requires both dev servers running:
//   npm run dev -w express-backend   (port 8000)
//   npm run dev -w react-frontend    (port 5173)

describe("DynamicFit App", () => {
  beforeEach(() => {
    cy.loginViaApi();
  });

  // ─── Auth ────────────────────────────────────────────────────────────────

  it("redirects unauthenticated users to /login", () => {
    cy.clearLocalStorage();
    cy.visit("/");
    cy.url().should("include", "/login");
    cy.contains("Login").should("be.visible");
  });

  it("shows login and signup forms on /login", () => {
    cy.clearLocalStorage();
    cy.visit("/login");
    cy.contains("Log In").should("be.visible");
    cy.contains("Sign Up").should("be.visible");
  });

  // ─── Navigation ──────────────────────────────────────────────────────────

  it("shows the bottom nav when logged in", () => {
    cy.visit("/");
    cy.get(".bottomNav").should("be.visible");
    cy.contains(".navBtn", "New").should("be.visible");
    cy.contains(".navBtn", "History").should("be.visible");
    cy.contains(".navBtn", "Exercises").should("be.visible");
    cy.contains(".navBtn", "Dashboard").should("be.visible");
    cy.contains(".navBtn", "Settings").should("be.visible");
  });

  // ─── New Workout page ─────────────────────────────────────────────────────

  it("visits the New page", () => {
    cy.visit("/");
    cy.contains("h1", "Create Workout").should("be.visible");
    cy.contains("Start Workout").should("be.visible");
  });

  // ─── Create a workout ─────────────────────────────────────────────────────

  it("creates a workout and saves it to History", () => {
    cy.visit("/");

    // Enter workout title and open the builder
    cy.get("input[list='workout-presets']").clear().type("Cypress Test Workout");
    cy.contains("Start Workout").click();
    cy.url().should("include", "/create-workout");

    // Wait for the exercise catalog to load then add the first exercise
    cy.get(".catalogList .exerciseRow", { timeout: 10000 }).first().within(() => {
      cy.contains("Add").click();
    });

    // Fill in sets and reps
    cy.get(".selectedCard").first().within(() => {
      cy.get("input").eq(0).clear().type("3");  // sets
      cy.get("input").eq(1).clear().type("10"); // reps
      cy.get("input").eq(2).clear().type("135"); // weight
    });

    // Save the workout
    cy.contains("Finish Workout").click();

    // Should redirect home with flash message
    cy.url().should("eq", Cypress.config("baseUrl") + "/");
    cy.contains("Cypress Test Workout").should("be.visible");
  });

  // ─── History page ─────────────────────────────────────────────────────────

  it("visits History and shows the saved workout", () => {
    cy.visit("/history");
    cy.contains("h1", "Workout History").should("be.visible");
    cy.contains("Cypress Test Workout").should("be.visible");
  });

  it("expands workout options in History", () => {
    cy.visit("/history");
    cy.contains("Cypress Test Workout")
      .closest(".listItem")
      .within(() => {
        cy.contains("Options").click();
        cy.contains("Edit").should("be.visible");
        cy.contains("Delete").should("be.visible");
      });
  });

  // ─── Edit workout ─────────────────────────────────────────────────────────

  it("edits a workout title", () => {
    cy.visit("/history");
    cy.contains("Cypress Test Workout")
      .closest(".listItem")
      .within(() => {
        cy.contains("Options").click();
        cy.contains("Edit").click();
      });

    cy.url().should("include", "/edit-workout/");
    cy.contains("h1", "Edit Workout").should("be.visible");

    cy.get("input[placeholder='Workout title']").clear().type("Cypress Edited Workout");
    cy.contains("Save Changes").click();

    cy.url().should("include", "/history");
    cy.contains("Cypress Edited Workout").should("be.visible");
  });

  // ─── Exercises page ───────────────────────────────────────────────────────

  it("visits the Exercises page and searches", () => {
    cy.visit("/exercises");
    cy.contains("h1", "Exercises").should("be.visible");
    cy.get(".exerciseGroups", { timeout: 10000 }).should("be.visible");

    // Search for something
    cy.get("input[placeholder='Search exercises or muscle groups']").type("squat");
    cy.get(".exerciseRow").should("have.length.greaterThan", 0);
  });

  // ─── Dashboard page ───────────────────────────────────────────────────────

  it("visits the Dashboard and shows stats", () => {
    cy.visit("/profile");
    cy.contains("h1", "Profile").should("be.visible");
    cy.contains("Account Overview").should("be.visible");
    cy.contains("This Week").should("be.visible");
    cy.contains("Personal Records").should("be.visible");
    cy.get(".heatmapGrid", { timeout: 10000 }).should("be.visible");
  });

  // ─── Settings page ────────────────────────────────────────────────────────

  it("visits Settings and saves preferences", () => {
    cy.visit("/settings");
    cy.contains("h1", "Settings").should("be.visible");
    cy.contains("Units").should("be.visible");
    cy.contains("Personal Records").should("be.visible");
    cy.contains("Security").should("be.visible");

    // Change display name and save
    cy.get("input[placeholder='Your name']").clear().type("Cypress User");
    cy.contains("Save Settings").click();
    cy.contains("Settings saved.").should("be.visible");
  });

  // ─── Delete workout ───────────────────────────────────────────────────────

  it("deletes the test workout from History", () => {
    cy.visit("/history");
    cy.contains("Cypress Edited Workout")
      .closest(".listItem")
      .within(() => {
        cy.contains("Options").click();
        cy.contains("Delete").click();
      });

    // Confirm the browser dialog
    cy.on("window:confirm", () => true);

    cy.contains("Cypress Edited Workout").should("not.exist");
  });

  // ─── Log out ──────────────────────────────────────────────────────────────

  it("logs out from Settings", () => {
    cy.visit("/settings");
    cy.contains("Log Out").click();
    cy.url().should("include", "/login");
  });
});
