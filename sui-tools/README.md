## Create Token

```bash
curl --location 'http://localhost:3000/api/createToken' \
--header 'Content-Type: application/json' \
--data '{
    "name": "MEGH Quote",
    "symbol": "MCCQ",
    "decimals": 9,
    "description": "Token creator token.",
    "iconUrl":
      "https://pbs.twimg.com/profile_images/1792571582902095872/1h0Tm7RU_400x400.jpg"
}'
```

## Mint Token

```bash
curl --location 'http://localhost:3000/api/mintToken' \
--header 'Content-Type: application/json' \
--data '{
    "treasury": "0xfee2e3890dbaaf6ca0fd1a79fc8126eef1bab7eb31d1e89c98edb5a284ee344d",
    "coinType": "0x3789b46e1a9507d4f2ae69c1f387c7186a710e4cd3ffbcd6da31366a6a6bbb6b::mccq::MCCQ",
    "amount": "100000000000",
    "recipient": "0x70be1d2743d8983cbd707b1746a40c52038201c1edbdc7825fe034e113b0ac44"
}'
```

## Send Token

```bash
curl --location 'http://localhost:3000/api/send' \
--header 'Content-Type: application/json' \
--data '{
      "token":
        "0x74fcd213fec0bb7f6705bd636f32d01a32de00159a5441bd21f6ff91a3a65be0",
      "accounts": [
        {
          "address":
            "0xfc6232355faa2e3d02549ae9ffabba7224bd71d1e1249160615c35a8508284f0",
          "amount": "10000000000"
        },
        {
          "address":
            "0x70e5c118f7e242e5275da716f1c87235200c918b5485939c5c468ab8ea17fcba",
          "amount": "10000000000"
        },
        {
          "address":
            "0x06570a63853bf0034b33cb3018b9760467213fd867e689ef0b45758d7f01c7c6",
          "amount": "10000000000"
        }
      ]
    }'
```

## Create Pool

```bash
curl --location 'http://localhost:3000/api/createPool' \
--header 'Content-Type: application/json' \
--data '{
    "baseToken": "0x166526b40c2fcada36f6d20ddce0b39e043ca71574d78cbd3e949682757c2571",
    "quoteToken": "0x74fcd213fec0bb7f6705bd636f32d01a32de00159a5441bd21f6ff91a3a65be0",
    "baseTokenAmount": "10000000000",
    "quoteTokenAmount": "10000000000",
    "feePercent": 0.0025,
    "minPrice": 1,
    "maxPrice": 10
}'
```

## Swap in Pool

```bash
curl --location 'http://localhost:3000/api/swap' \
--header 'Content-Type: application/json' \
--data '{
    "poolAddress": "0x37a17c7a9127901c481dc8d3a363f6ea629863e98c00fc76a2b468acd560d9a1",
    "amount": "1000000000"
}'
```

## Merge mints

```bash
curl --location 'http://localhost:3000/api/merge' \
--header 'Content-Type: application/json' \
--data '{
    "coinType": "0x3789b46e1a9507d4f2ae69c1f387c7186a710e4cd3ffbcd6da31366a6a6bbb6b::mccq::MCCQ"
}'
```