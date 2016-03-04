#! /bin/bash
# title       : setup
# description : setup atom-editor and install packages
# author      : Adam Houston (@phazyy)
# usage       : sh ./setup.sh

cp config.cson ~/.atom/
cp keymap.cson ~/.atom/
apm install color-picker easy-motion-redux emmet ex-mode language-javascript-jsx linter linter-jshint pigments react vim-mode