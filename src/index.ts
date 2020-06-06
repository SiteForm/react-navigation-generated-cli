#!/usr/bin/env node
import { program } from 'commander';
import yaml from 'js-yaml';
import fs from 'fs';
import { Project } from 'ts-morph';
const { exec } = require('child_process');

// MARK requires that an ios simulator is running
const process = exec('expo start -i');

process.stdout.on('data', (data: any) => {
  console.log(data.toString());
});

process.stderr.on('data', (data: any) => {
  console.log('stderr: ' + data.toString());
});

process.on('exit', (code: any) => {
  console.log('child process exited with code ' + code.toString());
});
