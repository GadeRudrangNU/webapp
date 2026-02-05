# CSYE 6225 – Cloud Native Web Application (Assignment 2)


## Tech Stack

- **Runtime:** Node.js 
- **Framework:** Express
- **Database:** PostgreSQL
- **ORM:** Prisma
- **Testing:** Jest + Supertest
- **CI:** GitHub Actions

---

## Project Structure

```text
webapp/
├── src/
│   ├── routes/
│   │   ├── healthz.js        # Health check endpoint (strict method & payload handling)
│   │   └── user.js           # User APIs: create, get self, update self
│   ├── middleware/
│   │   └── auth.js           # HTTP Basic Auth middleware
│   ├── db.js                 # Prisma client initialization
│   ├── app.js                # Express app, middleware, error handling
│   └── server.js             # Application entry point
│
├── prisma/
│   ├── schema.prisma         # Prisma schema (User, HealthCheck models)
│   └── migrations/           # Database migrations (committed)
│
├── tests/
│   ├── user.test.js          # Integration tests for user APIs
│   └── healthz.test.js       # Integration tests for healthz API
│
├── .github/
│   └── workflows/
│       └── ci.yml            # GitHub Actions CI pipeline
│
├── .gitignore                # Excludes secrets, dependencies, IDE files
├── package.json              # Dependencies and scripts
├── package-lock.json         # Locked dependency versions
├── README.md                 # Project documentation



## Integration Testing

This project uses **Jest + Supertest** to run full integration tests against the API and database.

### Test Coverage Includes
- Positive API flows (user creation, authentication, updates)
- Validation errors and edge cases
- Authentication failures
- Content-Type enforcement (`415 Unsupported Media Type`)
- Malformed JSON handling
- Strict HTTP method handling
- Health check hardening (no body, no query params, no HEAD)
- Data integrity checks
- Unknown routes (`404 Not Found` handling)

### Run Tests Locally
npm test
## Running the Application

### Install dependencies
npm install


### Start the application
npm run dev

The application runs on: http://localhost:8080


## Continuous Integration (CI)

This repository includes a **GitHub Actions workflow** for automated testing.

### Workflow File
`.github/workflows/ci.yml`

### CI Pipeline Responsibilities
- Runs on every pull request to the **upstream** branch
- Spins up a PostgreSQL service container
- Sets test environment variables
- Installs dependencies using `npm ci`
- Runs Prisma migrations
- Executes Jest integration tests
- Blocks pull request merges if tests fail

### CI Guarantees
- Code quality gates are enforced
- No untested code is merged
- CI behavior closely matches real production pipelines

---

## Branching & Workflow

- All development is done on **feature branches** in a fork
- Pull Requests are opened from **fork → organization repository**
- CI runs automatically on every Pull Request
- Branch protection rules enforce:
  - Required Pull Requests
  - Required CI checks
  - No direct pushes to protected branches

---

## Security & Best Practices

- No secrets or credentials are committed
- `.env` files are ignored via `.gitignore`
- No `node_modules`, build artifacts, or IDE files are committed
- All configuration is environment-based
- Graceful error handling with meaningful responses
- No unhandled `500 Internal Server Error` responses in API flows

---

## Assignment Scope Summary

This assignment demonstrates:
- Production-grade REST API design
- Comprehensive integration testing
- Continuous Integration using GitHub Actions
- Proper Git workflows and branch protection
- Secure configuration management
- Robust error handling and validation