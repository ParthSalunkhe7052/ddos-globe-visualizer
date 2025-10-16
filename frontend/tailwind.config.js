/* eslint-env node */
/* global module */
"use strict";
/** @type {import('@tailwindcss/postcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {},
  },
  plugins: [],
};
