// Only preloaded by the isolated HTTP test process, never by the application.
const RealDate = Date;
const now = RealDate.parse(process.env.FINANCE_TEST_NOW);
if (!Number.isFinite(now)) throw new Error('FINANCE_TEST_NOW must be an ISO date');
global.Date = class extends RealDate {
  constructor(...args) { super(...(args.length ? args : [now])); }
  static now() { return now; }
  static parse(value) { return RealDate.parse(value); }
  static UTC(...args) { return RealDate.UTC(...args); }
};
