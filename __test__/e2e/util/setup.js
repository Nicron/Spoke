// This script will execute before the entire end to end run
jest.setTimeout(2 * 60 * 1000) // Set the test callback timeout to 2 minutes
global.e2e = {} // Pass global information around using the global object as Jasmine context isn't available.
