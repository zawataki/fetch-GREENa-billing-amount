const moment = require('moment');

/**
 * @class YearMonth
 */
class YearMonth {
  /**
   * Creates an instance of YearMonth.
   * @param {number} year
   * @param {number} month
   * @memberof YearMonth
   */
  constructor(year, month) {
    this.year = year;
    this.month = month;
  }
}

/**
 * Parse target year month list
 * @param {Array<string>} targetYearMonthOption
 * @return {Array<YearMonth>} List of target year months. By default,
 *    it will be the past 12 months from this month to 11 months ago.
 * @export
 */
module.exports = function parseTargetYearMonthOption(targetYearMonthOption) {
  const targetYearMonthList = [];

  if (!targetYearMonthOption) {
    const startOfThisMonth = moment().startOf('month');

    for (let i = 0; i < 12; i++) {
      const date = startOfThisMonth.clone().subtract(i, 'months');

      // Months are zero indexed, so January is month 0.
      targetYearMonthList.push(new YearMonth(date.year(), date.month() + 1));
    }

    return targetYearMonthList;
  }

  if (targetYearMonthOption.length === 0) {
    throw new Error('The option needs some value');
  }

  for (const yearMonthStr of targetYearMonthOption) {
    const validTargetYearMonthPattern = /^\d{4}-\d{2}$/;
    if (!validTargetYearMonthPattern.test(yearMonthStr)) {
      throw new Error(`The option accepts only a pattern `
        + `${validTargetYearMonthPattern}. The given value: ${yearMonthStr}`);
    }

    const targetYearMonth = moment(yearMonthStr);
    if (!targetYearMonth.isValid()) {
      throw new Error(`"${targetYearMonth}" is invalid year month`);
    }

    if (targetYearMonth.isAfter(moment())) {
      throw new Error(`The option accepts only this month or the past months.`
        + ` The given value: ${yearMonthStr}`);
    }

    // Months are zero indexed, so January is month 0.
    targetYearMonthList.push(
      new YearMonth(targetYearMonth.year(), targetYearMonth.month() + 1));
  }

  return targetYearMonthList;
};
