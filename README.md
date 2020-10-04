# About
A script to fetch a billing amount of money from [GREENa](https://ne-greena.jp/).

# How to Use
1. Install necessary dependencies
    ```bash
    npm install
    ```

2. Install necessary dependencies
    ```bash
    node fetch-billing-amount.js --email 'yourEmailAddress' --pass 'yourPassword'
    ```

## When use Docker
1. Build Docker image
    ```bash
    docker build -t puppeteer-chrome-linux .
    ```

2. Run the image as container to get the billing amount
    ```bash
    docker run -i --rm --cap-add=SYS_ADMIN \
      --name puppeteer-chrome puppeteer-chrome-linux \
      node -e "`cat fetch-billing-amount.js`" \
      -- --email 'yourEmailAddress' --pass 'yourPassword'
    ```
