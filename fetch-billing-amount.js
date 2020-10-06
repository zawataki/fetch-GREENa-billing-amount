const puppeteer = require('puppeteer');
const path = require('path');

const originalConsoleDebug = console.debug;

console.debug = function(...parameters) {
  if (options['debug']) {
    if (parameters.length >= 1) {
      parameters[0] = `[DEBUG] ${parameters[0]}`;
    }
    originalConsoleDebug.apply(console, parameters);
  }
};

/**
 * Handle misuse of this script and exit from the script.
 * @param {String} errorMessage - error message
 */
function handleMisuseAndExit(errorMessage) {
  console.error('ERROR: ' + errorMessage + '\n');

  const thisFileName = path.basename(__filename);
  const usage = `${thisFileName}

  Fetches billing amount from GREENa.
  A default value of the period of the billing amount is last 12 months

Usage

  $ node ${thisFileName} --email EMAIL_ADDRESS --pass PASSWORD
    [--target-year-month YYYY-MM] [--debug]

Options

  --target-year-month YYYY-MM   Target year month.
                                This accepts multiple values as below.
                                  $ node ${thisFileName} --email EMAIL_ADDRESS
                                    --pass PASSWORD
                                    --target-year-month 2020-09
                                    --target-year-month 2020-08

  --debug                       Debug mode.
                                Run a browser in non-headless mode,
                                and show debug level messages.
`;
  console.info(usage);
  process.exit(1);
}

const commandLineArgs = require('command-line-args');
const optionDefinitions = [
  {
    name: 'email',
    type: String,
    required: true,
  },
  {
    name: 'pass',
    type: String,
    required: true,
  },
  {
    name: 'target-year-month',
    type: String,
    multiple: true,
  },
  {
    name: 'debug',
    type: Boolean,
  },
];
const options = commandLineArgs(optionDefinitions);

const requiredParameterNames = optionDefinitions.filter((opt) => opt.required)
  .map((opt) => opt.name);
for (const requiredParamName of requiredParameterNames) {
  if (!options[requiredParamName]) {
    handleMisuseAndExit(`Required parameter --${requiredParamName} is missing`);
  }
}

const parseTargetYearMonthOption = require('./target-year-month-parser.js');
let targetYearMonthList;
try {
  targetYearMonthList =
    parseTargetYearMonthOption(options['target-year-month']);
} catch (error) {
  handleMisuseAndExit('Failed to parse --target-year-month option: '
    + error.message);
}

const EMAIL_ADDRESS = options.email;
const PASSWORD = options.pass;

const URL_BASE = 'https://ne-greena.jp/greena';

/**
 * @param {Promise<object>} page - the page object
 * @param {number} targetYear - the target year
 * @param {number} targetMonth - the target month
 */
async function fetchBillingAmount(page, targetYear, targetMonth) {
  const MY_PAGE = URL_BASE + '/mypage';
  if (page.url() !== MY_PAGE) {
    await page.goto(MY_PAGE);
  }

  const selectTargetYearSelector
    = 'select#supply_point[name="inputBean.claimYear"]';
  await page.waitForSelector(selectTargetYearSelector);

  const selectedYear =
    await page.$eval(selectTargetYearSelector, (sel) => sel.value);
  if (selectedYear !== targetYear.toString()) {
    await page.select(selectTargetYearSelector, targetYear.toString());
  }

  const tableSelector = 'div#billing > table';
  await page.waitForSelector(tableSelector);

  const tableHeaderTextList =
    await page.$$eval(tableSelector + ' > tbody > tr:first-child > th',
      (thList) => thList.map((data) => data.textContent));
  const billingAmountColumnIndex =
    await getBillingAmountColumnIndex(tableHeaderTextList);

  const trSelector = tableSelector + ' > tbody > tr:nth-child(n+2)';
  const tableRecords = await page.$$(trSelector);
  for (const tr of tableRecords) {
    const monthElement = await tr.getProperty('firstElementChild');
    const monthValue = await monthElement.getProperty('innerText');
    const month = await monthValue.jsonValue();
    if (month !== targetMonth + '月') {
      continue;
    }

    let amountWithUnit;
    const tdList =
      await tr.$$(`:nth-child(n + ${billingAmountColumnIndex + 1})`);
    for (const td of tdList) {
      const tdInnerText = await td.getProperty('innerText');
      const tdJsonValue = await tdInnerText.jsonValue();
      if (tdJsonValue.match(/¥[\d,]+/)) {
        amountWithUnit = tdJsonValue;
        break;
      }
    }

    const amount = amountWithUnit.replace(/[¥, ]/g, '');
    return amount;
  }
}

/**
 * @param {Promise<Array<ElementHandle>>} tableHeaderTextList - a table header
 * text list
 * @return {number} Zero-based index of billing amount column.
 */
async function getBillingAmountColumnIndex(tableHeaderTextList) {
  let index = 0;
  for (const headerText of tableHeaderTextList) {
    if (headerText === '請求金額') {
      return index;
    }

    index++;
  }

  throw new Error('Failed to get billing amount column index');
}


(async () => {
  const browser = await puppeteer.launch({
    headless: !options['debug'],
  });

  try {
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(60 * 1000);

    const URL_LOGIN = URL_BASE + '/login';
    await page.goto(URL_LOGIN);

    console.debug('Log in');

    await page.type('input#inputForm_inputBean_mailAddress', EMAIL_ADDRESS);
    await page.type('input#inputForm_inputBean_password', PASSWORD);
    await page.click('input#inputForm__login');
    await page.waitForNavigation();

    if (page.url() === URL_LOGIN) {
      throw new Error('Failed to log in.'
        + ' Please check the email address and password are valid.');
    }

    for (const targetYearMonth of targetYearMonthList) {
      const year = targetYearMonth.year;
      const month = targetYearMonth.month;
      console.info('Fetching a billing amount on ' + year + '-' + month);
      console.info('The billing amount on ' + year + '-' + month + ': ' +
        await fetchBillingAmount(page, year, month));
    }
  } catch (error) {
    console.error(error);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
