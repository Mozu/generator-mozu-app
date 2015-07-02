var path = require('path');
var helpers = require('yeoman-generator').test;
var assert = require('yeoman-generator').assert;
var os = require('os');
var quickGitHits = require('quick-git-hits');
var rimraf = require('rimraf');

describe('the mozu-app generator', function() {

  var tmpdir = path.join(os.tmpdir(), 'mozu-app-gen-test-' + (new Date().getTime()));
  var generator;
  var mozuConfig;


  before(function (done) {
    this.timeout(60000);
    try {
      mozuConfig = require('../mozu.config.json');
    } catch (e) {
      throw new Error("To run tests, you need a mozu.config.json that connects to a real Mozu sandbox account in the project directory, with a password either encoded as plaintext or set in the environment variable TEST_PW. Sorry.");
    }
    helpers.run(path.join( __dirname, '../generators/app'))
      .inDir(tmpdir)  // Clear the directory and set it as the CWD
      .withOptions({ 
        internal: 'true',
        developerAccountId: mozuConfig.developerAccountId
      })            // Mock options passed in
      // .withArguments(['name-x'])              // Mock the arguments
      .withPrompts({
        "mozuEnv": "Production/Sandbox",
        "Production/Sandbox_AccountLogin": mozuConfig.developerAccount.emailAddress,
        "Production/Sandbox_AppKey": mozuConfig.appKey,
        "Production/Sandbox_SharedSecret": mozuConfig.sharedSecret,
        "password": mozuConfig.developerAccount.password || process.env.TEST_PW,
        "developerAccountId": mozuConfig.developerAccountId, 
        "createGit": true,
        "applicationKey": "workingkey",
        "name": "Toast",
        "version": "0.3.9",
        "description": "Hot, buttered."
      })
      .on('ready', function (g) {
        // this is called right before `generator.run()` is called
        console.log('Successfully created generator');
        generator = g;
      })
      .on('end', function() {
        done();
      });
  });

  it("stores login and sync app credentials on keys corresponding to environment", function() {
    assert.equal(generator.developerInfoKeys.AppKey,"Production/Sandbox_AppKey", "Expected " + generator.developerInfoKeys.AppKey + " to equal Production/Sandbox_AppKey");
    assert.equal(generator.developerInfoKeys.SharedSecret,"Production/Sandbox_SharedSecret", "Expected " + generator.developerInfoKeys.SharedSecret + " to equal Production/Sandbox_SharedSecret");
    assert.equal(generator.developerInfoKeys.AccountLogin,"Production/Sandbox_AccountLogin", "Expected " + generator.developerInfoKeys.AccountLogin + " to equal Production/Sandbox_AccountLogin");
  })


  it('creates a mozu.config.json', function() {
    assert.file([path.join(tmpdir,'mozu.config.json')], "mozu.config.json doesn't exist");
  });

  it('contains full login information in the mozu.config', function() {
    var gennedConfig = require(path.join(tmpdir, 'mozu.config.json'));
    assert.equal(gennedConfig.appKey, mozuConfig.appKey);
    assert.equal(gennedConfig.sharedSecret, mozuConfig.sharedSecret);
    assert.equal(gennedConfig.workingApplicationKey, 'workingkey');
    assert.equal(gennedConfig.developerAccount.emailAddress, mozuConfig.developerAccount.emailAddress);
    assert.equal(gennedConfig.developerAccountId, mozuConfig.developerAccountId);
  });

  it("creates a package.json", function() {
    assert.file([path.join(tmpdir, 'package.json')], "package.json doesn't exist");
  });

  it("contains name, description, and version information in the package.json", function() {
    var pkg = require(path.join(tmpdir, "package.json"));
    assert.equal(pkg.name, "Toast");
    assert.equal(pkg.version, "0.3.9");
    assert.equal(pkg.description, "Hot, buttered.");
  })

  it('contains a fresh git repo', function(done) {
    quickGitHits.detectDirectory(tmpdir, function(err, result) {
      assert(result.inGitRepo, 'git repo not successfully created!');
      done();
    })
  });

  after(function() {
    rimraf.sync(tmpdir);
  })

});