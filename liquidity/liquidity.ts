import { Commitment, Connection, PublicKey } from '@solana/web3.js';
import {
  Liquidity,
  LiquidityPoolKeys,
  Market,
  TokenAccount,
  SPL_ACCOUNT_LAYOUT,
  publicKey,
  struct,
  MAINNET_PROGRAM_ID,
  LiquidityStateV4,
} from '@raydium-io/raydium-sdk';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { MinimalMarketLayoutV3 } from '../market';
import BN from 'bn.js';
import Moralis from 'moralis';
import { MORALIS_API_KEY } from '../constants';

export type TokenAccountWithAmountAndPrice = TokenAccount & { amount: BN; price: number | undefined };

export const RAYDIUM_LIQUIDITY_PROGRAM_ID_V4 = MAINNET_PROGRAM_ID.AmmV4;
export const OPENBOOK_PROGRAM_ID = MAINNET_PROGRAM_ID.OPENBOOK_MARKET;

export const MINIMAL_MARKET_STATE_LAYOUT_V3 = struct([publicKey('eventQueue'), publicKey('bids'), publicKey('asks')]);

export function createPoolKeys(
  id: PublicKey,
  accountData: LiquidityStateV4,
  minimalMarketLayoutV3: MinimalMarketLayoutV3,
): LiquidityPoolKeys {
  return {
    id,
    baseMint: accountData.baseMint,
    quoteMint: accountData.quoteMint,
    lpMint: accountData.lpMint,
    baseDecimals: accountData.baseDecimal.toNumber(),
    quoteDecimals: accountData.quoteDecimal.toNumber(),
    lpDecimals: 5,
    version: 4,
    programId: RAYDIUM_LIQUIDITY_PROGRAM_ID_V4,
    authority: Liquidity.getAssociatedAuthority({
      programId: RAYDIUM_LIQUIDITY_PROGRAM_ID_V4,
    }).publicKey,
    openOrders: accountData.openOrders,
    targetOrders: accountData.targetOrders,
    baseVault: accountData.baseVault,
    quoteVault: accountData.quoteVault,
    marketVersion: 3,
    marketProgramId: accountData.marketProgramId,
    marketId: accountData.marketId,
    marketAuthority: Market.getAssociatedAuthority({
      programId: accountData.marketProgramId,
      marketId: accountData.marketId,
    }).publicKey,
    marketBaseVault: accountData.baseVault,
    marketQuoteVault: accountData.quoteVault,
    marketBids: minimalMarketLayoutV3.bids,
    marketAsks: minimalMarketLayoutV3.asks,
    marketEventQueue: minimalMarketLayoutV3.eventQueue,
    withdrawQueue: accountData.withdrawQueue,
    lpVault: accountData.lpVault,
    lookupTableAccount: PublicKey.default,
  };
}

export async function getTokenAccounts(
  connection: Connection,
  owner: PublicKey,
  commitment?: Commitment,
): Promise<TokenAccountWithAmountAndPrice[]> {
  const tokenResp = await connection.getTokenAccountsByOwner(
    owner,
    {
      programId: TOKEN_PROGRAM_ID,
    },
    commitment,
  );

  const accounts: TokenAccountWithAmountAndPrice[] = [];
  for (const { pubkey, account } of tokenResp.value) {
    const accountInfo = SPL_ACCOUNT_LAYOUT.decode(account.data);
    const coinPrice = await fetchCoinPrice(accountInfo.mint.toBase58(), MORALIS_API_KEY);
    accounts.push({
      pubkey,
      programId: account.owner,
      accountInfo,
      price: coinPrice,
      // Add the token amount to the account object
      amount: accountInfo.amount,
    });
  }

  return accounts;
}

export async function fetchCoinPrice(mintAddress: string, apiKey: string): Promise<number | undefined> {
  try {
    console.log('Fetching real-time coin price:', mintAddress, apiKey);
    await Moralis.start({ apiKey });
    const response = await Moralis.SolApi.token.getTokenPrice({
      network: 'mainnet',
      address: mintAddress,
    });
    const price = response.raw.usdPrice;
    if (price === 0) {
      // This is because method fetchCoinPrice is used for auto sell strategy after we reach some % of gain.
      // If the price is 0, we either way can't calculate the gain, so we return undefined.
      // Moralis docs: Currently, this API only support at most 4 decimal places results on usdPrice output field.
      // This implies that the smallest unit return will be 0.0001. Any token price below $0.0001 on Raydium will be rounded down and presented at 0.
      console.log(`Price of coin ${mintAddress} is 0, returning undefined`);
      return undefined;
    }
    return price;
  } catch (e) {
    console.error('Fetching real-time coin price:', e);
  }
}
