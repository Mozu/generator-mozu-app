# Mozu App generator

Maintainer: [James Zetlen](https://github.com/zetlen)

A Mozu App Generator that scaffolds a directory with some basic tools common to all types of Mozu App (Integrations, Extensions/Actions, and Themes). 

## This package is currently a prerelease.
**This contains pre-release code. It may have behaviors or rely on features that don't work in Mozu production environments. Use with caution!**

![](http://i.imgur.com/01FRhEd.png)

## Usage

First, install [Yeoman](http://yeoman.io)'s command line tool if you haven't already!

```bash
npm install -g yo
```

Yeoman looks for globally installed NPM packages that identify themselves as Yeoman generators. So globally install the mozu-app package!

```bash
npm install -g generator-mozu-app
```

Make a new directory and `cd` into it:
```
mkdir new-mozu-ext && cd new-mozu-ext
```

Run `yo mozu-app`:
```
yo mozu-app
```

## Options

* `--skip-install`
  
  Skips the automatic execution of `npm install` after scaffolding has finished.

* `--skip-prompts`

  Often you may find yourself rerunning the generator in the same directory. Your answers to prompts are saved; if you want to quickly re-run the generator without prompts, use this option. Will not work if you've never run the generator in this directory before.

* `--quick`
  
  Equivalent to `--skip-install --skip-prompts`.

* `--internal`

  Allows integration with non-production Mozu environments. The prompts will include an extra question about which environment to sync with.