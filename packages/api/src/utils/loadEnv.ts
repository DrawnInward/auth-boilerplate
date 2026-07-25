// Single owner of dotenv loading, side-effect imported by the modules that read
// process.env at import time. It replaces six copies of the same
// `require("dotenv").config(...)` line.
//
// `quiet` suppresses dotenv's startup banner. dotenv never overwrites a variable
// that is already set, so importing this from several modules is idempotent and
// cannot clobber values the test harness pins first (see jest.env.ts).
import { config } from "dotenv";

config({ quiet: true });
