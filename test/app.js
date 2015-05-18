var path = require('path');
var helpers = require('yeoman-generator').test;
var assert = require('yeoman-generator').assert;
var os = require('os');
var quickGitHits = require('quick-git-hits');
var rimraf = require('rimraf');

describe('the mozu-app generator', function() {

  var tmpdir = path.join(os.tmpdir(), 'mozu-app-gen-test-' + (new Date().getTime()));
  var generator;

  this.timeout(10000);

  before(function (done) {
    helpers.run(path.join( __dirname, '../generators/app'))
      .inDir(tmpdir)  // Clear the directory and set it as the CWD
      .withOptions({ internal: 'true' })            // Mock options passed in
      // .withArguments(['name-x'])              // Mock the arguments
      .withPrompts({
        "mozuEnv": {
          name: 'SI',
          domain: 'home.mozu-si.com'
        },
        "SI_AccountLogin": "james_zetlen@volusion.com",
        "SI_AppKey": "ecea159.developeraccess.1.0.0.release",
        "SI_SharedSecret": "977e6eba536e448db04d32cfbeddbbe7",
        "password": "Volusion1",
        "developerAccountId": 1075,
        "createGit": true,
      })
      .on('ready', function (g) {
        // this is called right before `generator.run()` is called
        console.log('Successfully created generator');
        generator = g;
      })
      .on('end', done);
  });

  it("stores login and sync app credentials on keys corresponding to environment", function() {
    assert.equal(generator.developerInfoKeys.AppKey,"SI_AppKey");
    assert.equal(generator.developerInfoKeys.SharedSecret,"SI_SharedSecret");
    assert.equal(generator.developerInfoKeys.AccountLogin,"SI_AccountLogin");
  })


  it('creates a mozu.config.json', function() {
    assert.file([path.join(tmpdir,'mozu.config.json')], "mozu.config.json doesn't exist");
  });

  it('contains full login information in the mozu.config', function() {
    var mconfig = require(path.join(tmpdir, 'mozu.config.json'));
    assert.equal(mconfig.appKey, 'ecea159.developeraccess.1.0.0.release');
    assert.equal(mconfig.sharedSecret, '977e6eba536e448db04d32cfbeddbbe7');
    assert.equal(mconfig.developerAccount.emailAddress, 'james_zetlen@volusion.com');
    assert.equal(mconfig.developerAccountId, 1075);
  });

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