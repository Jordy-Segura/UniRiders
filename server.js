// Entry point to run the backend without changing directories.
// It simply re-exports the existing backend server.
require(require('path').join(__dirname, 'backend', 'server.js'));
