var path = require('path');
var helpers = require('yeoman-test');
var assert = require('yeoman-assert');
var test = require('tape');
var jort = require('jort');

var generator;

var mozuConfig = {
  developerAccount: {
    emailAddress: 'test@example.com'
  },
  developerAccountId: 1,
  workingApplicationKey: 'workingkey'
}

test('setup', function(t) {
  var now = new Date();
  now.setYear(now.getYear()+1);
  var later = now.toISOString();
  jort({
    accessToken: 'accessToken',
    accessTokenExpiration: later,
    refreshToken: 'refreshToken',
    refreshTokenExpiration: later,
    availableAccounts: [
      {
        name: 'Test Dev Acct',
        value: mozuConfig.developerAccountId
      }
    ]
  }).then(function(url) {
    process.env.MOZU_HOMEPOD = url;
    helpers.run(path.join( __dirname, '../generators/app'))
    .withPrompts({
      "mozuEnv": "Production/Sandbox",
      "Production/Sandbox_AccountLogin": mozuConfig.developerAccount.emailAddress,
      "password": 'nothing',
      "developerAccountId": mozuConfig.developerAccountId,
      "createGit": true,
      "applicationKey": mozuConfig.workingApplicationKey,
      "name": "Toast",
      "version": "0.3.9",
      "description": "Hot, buttered."
    })
    .on('ready', function (g) {
      // this is called right before `generator.run()` is called
      console.log('Successfully created generator');
      generator = g;
    })
    .on('error', function(e) {
      if (typeof e === 'string') {
        t.fail(e);
      } else {
        t.fail(e.message + ': \n ' + e.stack);
      }
    })
    .on('end', t.end);
  });
});

test("stores login credentials on keys corresponding to environment", function(t) {
  t.plan(1);
  t.doesNotThrow(
    function() {
      assert.equal(generator.developerInfoKeys.AccountLogin,"Production/Sandbox_AccountLogin", "Expected " + generator.developerInfoKeys.AccountLogin + " to equal Production/Sandbox_AccountLogin");
    }
  );
});

test('creates a mozu.config.json', function(t) {
  t.plan(1);
  t.doesNotThrow(
    function() {
      assert.file(['mozu.config.json'], "mozu.config.json doesn't exist");
    }
  )
});

test('contains full login information in the mozu.config', function(t) {
  t.plan(1);
  t.doesNotThrow(
    function() {
      assert.JSONFileContent('mozu.config.json', mozuConfig);
    }
  );
});

test('creates a package.json', function(t) {
  t.plan(1);
  t.doesNotThrow(
    function() {
      assert.file(['package.json'], "package.json doesn't exist");
    }
  )
});


test("contains name, description, and version information in the package.json", function(t) {
  t.plan(1);
  t.doesNotThrow(
    function() {
      assert.JSONFileContent(
        'package.json',
        {
          name: 'Toast',
          version: '0.3.9',
          description: 'Hot, buttered.'
        }
      )
    }
  )
});

test('contains a fresh git repo', function(t) {
  t.plan(1);
  t.doesNotThrow(
    function() {
      assert.file(['.git'], 'git repo not successfully created');
    }
  );
});
