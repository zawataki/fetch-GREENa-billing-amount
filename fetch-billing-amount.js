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

  const selectTargetYearSelector = 'select#mypage_inputBean_claimYear';
  await page.waitForSelector(selectTargetYearSelector);

  page.select(selectTargetYearSelector, targetYear.toString());

  const tableSelector = '#billingArea > table';
  await page.waitForSelector(tableSelector);

  const trSelector = '#billingArea > table > tbody > '
    + 'tr:nth-child(n+2):nth-child(-n+13)';
  const tableRecords = await page.$$(trSelector);
  for (const tr of tableRecords) {
    const monthElement = await tr.getProperty('firstElementChild');
    const monthValue = await monthElement.getProperty('innerText');
    const month = await monthValue.jsonValue();
    if (month !== targetMonth + '月') {
      continue;
    }

    const showAmountButtonElement = await tr.$('#cedarTreesLast > p > a');
    await showAmountButtonElement.click();
    const billingAmountSelector = '#billingDetail div.total dl';
    await page.waitForSelector(billingAmountSelector);

    const billingAmountElements = await page.$$(billingAmountSelector);
    for (const element of billingAmountElements) {
      const str = await (await element.getProperty('innerText')).jsonValue();
      if (RegExp('^ご請求金額').test(str)) {
        const amountElement = await element.$('dd');
        const amountWithUnit = await amountElement.getProperty('innerText');
        const amount = (await amountWithUnit.jsonValue()).replace(/[¥, ]/g, '');
        return amount;
      }
    }
  }
}

(async () => {
  const browser = await puppeteer.launch({headless: false});

  try {
    const page = await browser.newPage();
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
      console.info('Fetch a billing amount on ' + year + '-' + month);

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
