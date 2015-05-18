var path = require('path');
var helpers = require('yeoman-generator').test;
var assert = require('yeoman-generator').assert;
var os = require('os');
var quickGitHits = require('quick-git-hits');

describe('the mozu-app generator', function() {

  var tmpdir = path.join(os.tmpdir(), 'mozu-app-gen-test-' + (new Date().getTime()));

  before(function (done) {
    helpers.run(path.join( __dirname, '../generators/app'))
      .inDir(tmpdir)  // Clear the directory and set it as the CWD
      // .withOptions({ foo: 'bar' })            // Mock options passed in
      // .withArguments(['name-x'])              // Mock the arguments
      .withPrompts({
        "Production/Sandbox_AccountLogin": "mozuqa@volusion.com",
        "Production/Sandbox_AppKey": "appkey.example",
        "Production/Sandbox_SharedSecret": "sharedsecret.example",
        "password": "password",
        "developerAccountId": 1234,
        "createGit": true,
      })
      .on('ready', function (g) {
        // this is called right before `generator.run()` is called
        console.log('Successfully created generator');
      })
      .on('end', done);
  });


  it('creates a mozu.config.json', function() {
    (function() {
      assert.file([path.join(tmpdir,'mozu.config.json')]);
    }).should.not.throw;
  });

});