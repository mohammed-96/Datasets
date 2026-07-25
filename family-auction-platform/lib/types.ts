export type BidRow = {
  alias: string;
  amount: number;
  createdAt: string;
  isMine: boolean;
};

export type AuctionDetail = {
  id: string;
  status: "DRAFT" | "UPCOMING" | "LIVE" | "ENDED" | "CANCELLED" | "SUSPENDED";
  openingPrice: number;
  currentPrice: number;
  bidIncrement: number;
  startAt: string;
  endAt: string;
  softCloseEnabled: boolean;
  extensionMinutes: number;
  winnerAlias: string | null;
  winningBid: number | null;
  minNextBid: number;
  isTopBidder: boolean;
  hasUserBid: boolean;
  bids: BidRow[];
};
