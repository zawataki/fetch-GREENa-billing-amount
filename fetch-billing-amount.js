const puppeteer = require('puppeteer');

/**
 * Show usage of this script and exit from the script
 */
function showUsageAndExit() {
  const usage = `
Usage: node ${__filename} --email EMAIL_ADDRESS --pass PASSWORD

Fetches billing amount from GREENa.
A default value of the period of the billing amount is last 12 months`;
  console.info(usage);
  process.exit(1);
}

if (process.argv.length < 5) {
  showUsageAndExit();
}

const commandLineArgs = require('command-line-args');
const optionDefinitions = [
  {
    name: 'email',
    type: String,
  },
  {
    name: 'pass',
    type: String,
  },
];
const options = commandLineArgs(optionDefinitions);

if (options.email === '' || options.pass === '') {
  showUsageAndExit();
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

  await page.select(selectTargetYearSelector, targetYear.toString());

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

    const amountWithUnit = await tr.$eval(
      ':nth-child(' + (billingAmountColumnIndex + 1) + ')',
      (aaa) => aaa.innerText);
    const amount = amountWithUnit.replace(/[¥, ]/g, '');
    return amount;
  }
}

/**
 * @param {Promise<Array<ElementHandle>>} tableHeaderTextList - a table header
 * text list
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
  const browser = await puppeteer.launch({headless: false});

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

    const now = new Date();
    now.setDate(1);
    for (let index = 0; index < 12; index++) {
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      console.info('Fetching a billing amount on ' + year + '-' + month);
      console.info('The billing amount on ' + year + '-' + month + ': ' +
        await fetchBillingAmount(page, year, month));

      now.setMonth(now.getMonth() - 1);
    }
  } catch (error) {
    console.error(error);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
