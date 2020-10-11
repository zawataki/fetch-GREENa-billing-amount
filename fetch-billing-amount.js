const puppeteer = require('puppeteer');
const path = require('path');
const log4js = require('log4js');
const fileName = path.basename(__filename);
const log = log4js.getLogger(fileName);

log.level = 'error';

/**
 * Print usage of this script.
 */
function printUsage() {
  const commandLineUsage = require('command-line-usage');
  const basicUsage =
    `$ node ${fileName} --email EMAIL_ADDRESS --pass PASSWORD`;
  const sections = [
    {
      header: fileName,
      content: 'Fetches billing amount from GREENa.',
    },
    {
      header: 'Synopsis',
      content: [
        `  ${basicUsage} [options ...]`,
      ],
      raw: true,
    },
    {
      header: 'Options',
      optionList: optionDefinitions.filter((opt) => !opt.required),
    },
    {
      header: 'Examples',
      content: [
        'To fetch billing amount for the past 12 months including this month:',
        '',
        `    ${basicUsage}`,
        '',
        'To fetch billing amount for September 2020:',
        '',
        `    ${basicUsage} --target-year-month 2020-09`,
        '',
        'To fetch billing amount for April and August 2020:',
        '',
        `    ${basicUsage} --target-year-month 2020-04 2020-08`,
      ].map((line) => '  ' + line),
      raw: true,
    },
  ];
  const usage = commandLineUsage(sections);
  console.log(usage);
}

/**
 * Handle misuse of this script and exit from the script.
 * @param {String} errorMessage - error message
 */
function handleMisuseAndExit(errorMessage) {
  log.error(errorMessage);

  printUsage();

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
    typeLabel: '{underline YYYY-MM}',
    description: 'Target year month. e.g. 2020-08.'
      + ' Accepts multiple year months as below.',
  },
  {
    name: 'log-level',
    type: String,
    description: 'Log level. Valid values are "fatal", "error", "warn",'
      + ` "info", "debug", and "trace". Default to "`
      + `${log.level.toString().toLowerCase()}".`
      + ' When this option and --debug option are enable,'
      + ' set the value of this option to the log level.',
  },
  {
    name: 'debug',
    type: Boolean,
    description: 'Debug mode. Run a browser in non-headless mode and'
      + ' show debug level messages.',
  },
  {
    name: 'help',
    alias: 'h',
    type: Boolean,
    description: 'Display this usage guide.',
  },
];
const options = commandLineArgs(optionDefinitions);

if (options['help']) {
  printUsage();
  process.exit();
}

if (options['debug']) {
  log.level = 'debug';
}

const VALID_LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'];
if (options['log-level']) {
  if (!VALID_LOG_LEVELS.includes(options['log-level'])) {
    handleMisuseAndExit(`Invalid log level: "${options['log-level']}"`);
  }
  log.level = options['log-level'];
}

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

    log.info('Log in');

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
      log.info('Fetching a billing amount on ' + year + '-' + month + '...');
      console.log('Billing amount on ' + year + '-' + month + ': ' +
        await fetchBillingAmount(page, year, month));
    }
  } catch (error) {
    log.error(error);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
