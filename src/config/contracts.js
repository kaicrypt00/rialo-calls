// ─── ADDRESSES ───────────────────────────────────────────────────────────────

export const CONTRACT_ADDRESSES = {
  RLO_TOKEN:            '0x277C8aDbD292CB75CC5F0172714CF6842F4F90f1',
  PROFILE_REGISTRY:     '0x2DE1Ed07C104E775aE7368b1B8e2AA669b5CE5C8',
  BETTING_POOL:         '0x16150779747feF42333a8FDD98E58BfE3CFe7cce',
  ACHIEVEMENT_REGISTRY: '0xE33651061F0Cb054A083E6E2C758ac1b81413832',
}

export const ADMIN_WALLETS = [
  '0x2601Ab18C41Eb4cCbb31A6961Dc0BBb8a946E195',
  '0x18C8D508988DdEACF1ED081e6f371630FE5245B8',
]

export function isAdmin(address) {
  if (!address) return false
  return ADMIN_WALLETS.map(a => a.toLowerCase()).includes(address.toLowerCase())
}

// ─── ENUM CONSTANTS ───────────────────────────────────────────────────────────
// BettingPool: side — 1 = YES, 2 = NO (0 = unset)
export const SIDE = { YES: 1, NO: 2 }

// BettingPool: status — 0=open, 1=locked, 2=yes_wins, 3=no_wins, 4=refunded, 5=deleted
export const STATUS = { OPEN: 0, LOCKED: 1, YES_WINS: 2, NO_WINS: 3, REFUNDED: 4, DELETED: 5 }

// Minimum bet in RLO (10 RLO = 10 * 1e18)
export const MIN_BET_RLO = 10

// ─── RLO TOKEN ABI ───────────────────────────────────────────────────────────

export const RLO_ABI = [
  { inputs: [], name: 'name', outputs: [{ type: 'string' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'symbol', outputs: [{ type: 'string' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'decimals', outputs: [{ type: 'uint8' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'totalSupply', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'owner', outputs: [{ type: 'address' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'account', type: 'address' }], name: 'balanceOf', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], name: 'allowance', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'wallet', type: 'address' }], name: 'lastClaimed', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'FAUCET_AMOUNT', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'CLAIM_INTERVAL', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], name: 'transfer', outputs: [{ type: 'bool' }], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], name: 'approve', outputs: [{ type: 'bool' }], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'from', type: 'address' }, { name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], name: 'transferFrom', outputs: [{ type: 'bool' }], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [], name: 'claim', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], name: 'mint', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { anonymous: false, inputs: [{ indexed: true, name: 'from', type: 'address' }, { indexed: true, name: 'to', type: 'address' }, { indexed: false, name: 'value', type: 'uint256' }], name: 'Transfer', type: 'event' },
  { anonymous: false, inputs: [{ indexed: true, name: 'owner', type: 'address' }, { indexed: true, name: 'spender', type: 'address' }, { indexed: false, name: 'value', type: 'uint256' }], name: 'Approval', type: 'event' },
]

// ─── PROFILE REGISTRY ABI ────────────────────────────────────────────────────

export const PROFILE_REGISTRY_ABI = [
  { inputs: [], stateMutability: 'nonpayable', type: 'constructor' },
  { inputs: [{ name: '_name', type: 'string' }, { name: '_bio', type: 'string' }, { name: '_pfpHash', type: 'string' }, { name: '_xUsername', type: 'string' }], name: 'mintProfile', outputs: [], stateMutability: 'payable', type: 'function' },
  { inputs: [{ name: '_name', type: 'string' }, { name: '_bio', type: 'string' }, { name: '_pfpHash', type: 'string' }, { name: '_xUsername', type: 'string' }], name: 'updateProfile', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'wallet', type: 'address' }], name: 'getProfile', outputs: [{ name: 'name', type: 'string' }, { name: 'bio', type: 'string' }, { name: 'pfpHash', type: 'string' }, { name: 'xUsername', type: 'string' }, { name: 'mintedAt', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'wallet', type: 'address' }], name: 'hasProfile', outputs: [{ type: 'bool' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'totalProfiles', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'getAllAddresses', outputs: [{ type: 'address[]' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'withdrawFees', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'newOwner', type: 'address' }], name: 'transferOwnership', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [], name: 'MINT_FEE', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'owner', outputs: [{ type: 'address' }], stateMutability: 'view', type: 'function' },
  { anonymous: false, inputs: [{ indexed: true, name: 'wallet', type: 'address' }, { indexed: false, name: 'name', type: 'string' }, { indexed: false, name: 'xUsername', type: 'string' }, { indexed: false, name: 'timestamp', type: 'uint256' }], name: 'ProfileMinted', type: 'event' },
  { anonymous: false, inputs: [{ indexed: true, name: 'wallet', type: 'address' }, { indexed: false, name: 'name', type: 'string' }, { indexed: false, name: 'bio', type: 'string' }, { indexed: false, name: 'pfpHash', type: 'string' }, { indexed: false, name: 'xUsername', type: 'string' }], name: 'ProfileUpdated', type: 'event' },
  { stateMutability: 'payable', type: 'receive' },
]

// ─── BETTING POOL ABI ─────────────────────────────────────────────────────────

export const BETTING_POOL_ABI = [
  { inputs: [{ name: '_rloToken', type: 'address' }], stateMutability: 'nonpayable', type: 'constructor' },
  { inputs: [{ name: '_title', type: 'string' }, { name: '_description', type: 'string' }, { name: '_bannerUrl', type: 'string' }, { name: '_deadline', type: 'uint256' }], name: 'createPrediction', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'id', type: 'uint256' }], name: 'deletePrediction', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'id', type: 'uint256' }], name: 'refundPrediction', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'id', type: 'uint256' }, { name: 'newDeadline', type: 'uint256' }], name: 'extendDeadline', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'id', type: 'uint256' }], name: 'lockBetting', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'id', type: 'uint256' }], name: 'unlockBetting', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'id', type: 'uint256' }, { name: 'winningSide', type: 'uint8' }], name: 'declareWinner', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'id', type: 'uint256' }, { name: 'side', type: 'uint8' }, { name: 'amount', type: 'uint256' }], name: 'placeBet', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'id', type: 'uint256' }], name: 'claimWinnings', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'id', type: 'uint256' }], name: 'claimRefund', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'id', type: 'uint256' }], name: 'getPrediction', outputs: [{ components: [{ name: 'id', type: 'uint256' }, { name: 'title', type: 'string' }, { name: 'description', type: 'string' }, { name: 'bannerUrl', type: 'string' }, { name: 'deadline', type: 'uint256' }, { name: 'status', type: 'uint8' }, { name: 'yesPool', type: 'uint256' }, { name: 'noPool', type: 'uint256' }, { name: 'totalBettors', type: 'uint256' }, { name: 'createdAt', type: 'uint256' }], type: 'tuple' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'id', type: 'uint256' }, { name: 'user', type: 'address' }], name: 'getUserBet', outputs: [{ name: 'side', type: 'uint8' }, { name: 'amount', type: 'uint256' }, { name: 'claimed', type: 'bool' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'id', type: 'uint256' }], name: 'isBettingLocked', outputs: [{ type: 'bool' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'getAllIds', outputs: [{ type: 'uint256[]' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'totalPredictions', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'user', type: 'address' }], name: 'getBetCount', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'id', type: 'uint256' }], name: 'getBettors', outputs: [{ type: 'address[]' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'id', type: 'uint256' }, { name: 'user', type: 'address' }], name: 'getClaimableAmount', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'newOwner', type: 'address' }], name: 'transferOwnership', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [], name: 'owner', outputs: [{ type: 'address' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'ADMIN_ONE', outputs: [{ type: 'address' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'ADMIN_TWO', outputs: [{ type: 'address' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'MIN_BET', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'LOCKOUT_PERIOD', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'rloToken', outputs: [{ type: 'address' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: '', type: 'uint256' }], name: 'predictions', outputs: [{ name: 'id', type: 'uint256' }, { name: 'title', type: 'string' }, { name: 'description', type: 'string' }, { name: 'bannerUrl', type: 'string' }, { name: 'deadline', type: 'uint256' }, { name: 'status', type: 'uint8' }, { name: 'yesPool', type: 'uint256' }, { name: 'noPool', type: 'uint256' }, { name: 'totalBettors', type: 'uint256' }, { name: 'createdAt', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: '', type: 'address' }], name: 'betCount', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { anonymous: false, inputs: [{ indexed: true, name: 'id', type: 'uint256' }, { indexed: false, name: 'title', type: 'string' }, { indexed: false, name: 'deadline', type: 'uint256' }, { indexed: false, name: 'createdAt', type: 'uint256' }], name: 'PredictionCreated', type: 'event' },
  { anonymous: false, inputs: [{ indexed: true, name: 'id', type: 'uint256' }], name: 'PredictionDeleted', type: 'event' },
  { anonymous: false, inputs: [{ indexed: true, name: 'id', type: 'uint256' }], name: 'PredictionRefunded', type: 'event' },
  { anonymous: false, inputs: [{ indexed: true, name: 'id', type: 'uint256' }, { indexed: false, name: 'lockedAt', type: 'uint256' }], name: 'BettingLocked', type: 'event' },
  { anonymous: false, inputs: [{ indexed: true, name: 'id', type: 'uint256' }, { indexed: false, name: 'unlockedAt', type: 'uint256' }], name: 'BettingUnlocked', type: 'event' },
  { anonymous: false, inputs: [{ indexed: true, name: 'id', type: 'uint256' }, { indexed: false, name: 'newDeadline', type: 'uint256' }], name: 'DeadlineExtended', type: 'event' },
  { anonymous: false, inputs: [{ indexed: true, name: 'predictionId', type: 'uint256' }, { indexed: true, name: 'bettor', type: 'address' }, { indexed: false, name: 'side', type: 'uint8' }, { indexed: false, name: 'amount', type: 'uint256' }], name: 'BetPlaced', type: 'event' },
  { anonymous: false, inputs: [{ indexed: true, name: 'predictionId', type: 'uint256' }, { indexed: false, name: 'winningSide', type: 'uint8' }, { indexed: false, name: 'losingPool', type: 'uint256' }, { indexed: false, name: 'winningPool', type: 'uint256' }], name: 'WinnerDeclared', type: 'event' },
  { anonymous: false, inputs: [{ indexed: true, name: 'predictionId', type: 'uint256' }, { indexed: true, name: 'bettor', type: 'address' }, { indexed: false, name: 'amount', type: 'uint256' }], name: 'WinningsClaimed', type: 'event' },
  { anonymous: false, inputs: [{ indexed: true, name: 'predictionId', type: 'uint256' }, { indexed: true, name: 'bettor', type: 'address' }, { indexed: false, name: 'amount', type: 'uint256' }], name: 'RefundClaimed', type: 'event' },
]

// ─── ACHIEVEMENT REGISTRY ABI ─────────────────────────────────────────────────

export const ACHIEVEMENT_REGISTRY_ABI = [
  { inputs: [], stateMutability: 'nonpayable', type: 'constructor' },
  { inputs: [{ name: 'badge', type: 'uint8' }], name: 'mintBadge', outputs: [], stateMutability: 'payable', type: 'function' },
  { inputs: [{ name: 'newPool', type: 'address' }], name: 'setBettingPool', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [], name: 'withdrawFees', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'newOwner', type: 'address' }], name: 'transferOwnership', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'wallet', type: 'address' }, { name: 'badge', type: 'uint8' }], name: 'hasBadge', outputs: [{ type: 'bool' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'wallet', type: 'address' }, { name: 'badge', type: 'uint8' }], name: 'getBadgeRecord', outputs: [{ name: 'minted', type: 'bool' }, { name: 'mintedAt', type: 'uint256' }, { name: 'mintedAtBet', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'wallet', type: 'address' }], name: 'getAllBadges', outputs: [{ name: 'starter', type: 'bool' }, { name: 'caller', type: 'bool' }, { name: 'oracle', type: 'bool' }, { name: 'og', type: 'bool' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'wallet', type: 'address' }], name: 'getEligibleBadges', outputs: [{ name: 'eligible', type: 'uint256[]' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'wallet', type: 'address' }], name: 'getBetCount', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'badge', type: 'uint8' }], name: 'getBadgeName', outputs: [{ type: 'string' }], stateMutability: 'pure', type: 'function' },
  { inputs: [{ name: 'badge', type: 'uint8' }], name: 'getThreshold', outputs: [{ type: 'uint256' }], stateMutability: 'pure', type: 'function' },
  { inputs: [], name: 'MINT_FEE', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'STARTER_THRESHOLD', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'CALLER_THRESHOLD', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'ORACLE_THRESHOLD', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'OG_THRESHOLD', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'owner', outputs: [{ type: 'address' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'bettingPool', outputs: [{ type: 'address' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'ADMIN_ONE', outputs: [{ type: 'address' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'ADMIN_TWO', outputs: [{ type: 'address' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'totalBadgesMinted', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'accumulatedFees', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: '', type: 'address' }], name: 'badgeCount', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { stateMutability: 'payable', type: 'receive' },
  { anonymous: false, inputs: [{ indexed: true, name: 'wallet', type: 'address' }, { indexed: true, name: 'badge', type: 'uint8' }, { indexed: false, name: 'badgeName', type: 'string' }, { indexed: false, name: 'betCountAtMint', type: 'uint256' }, { indexed: false, name: 'timestamp', type: 'uint256' }], name: 'BadgeMinted', type: 'event' },
]

// ─── POLL REGISTRY ────────────────────────────────────────────────────────────

export const POLL_REGISTRY_ADDRESS = '0xf49E4AcDc164DB7907E485Ae5cD54D37da994089'

export const POLL_REGISTRY_ABI = [
  { inputs: [], stateMutability: 'nonpayable', type: 'constructor' },
  { inputs: [{ name: '_title', type: 'string' }, { name: '_description', type: 'string' }], name: 'submitPoll', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'pollId', type: 'uint256' }], name: 'vote', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'pollId', type: 'uint256' }], name: 'deletePoll', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'winnerIds', type: 'uint256[3]' }], name: 'closeRound', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'newOwner', type: 'address' }], name: 'transferOwnership', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [], name: 'getActivePolls', outputs: [{ components: [{ name: 'id', type: 'uint256' }, { name: 'title', type: 'string' }, { name: 'description', type: 'string' }, { name: 'submittedBy', type: 'address' }, { name: 'voteCount', type: 'uint256' }, { name: 'round', type: 'uint256' }, { name: 'deleted', type: 'bool' }, { name: 'createdAt', type: 'uint256' }], type: 'tuple[]' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'getHistory', outputs: [{ components: [{ name: 'round', type: 'uint256' }, { name: 'pollId', type: 'uint256' }, { name: 'title', type: 'string' }, { name: 'description', type: 'string' }, { name: 'submittedBy', type: 'address' }, { name: 'voteCount', type: 'uint256' }, { name: 'closedAt', type: 'uint256' }], type: 'tuple[]' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'pollId', type: 'uint256' }], name: 'getPoll', outputs: [{ components: [{ name: 'id', type: 'uint256' }, { name: 'title', type: 'string' }, { name: 'description', type: 'string' }, { name: 'submittedBy', type: 'address' }, { name: 'voteCount', type: 'uint256' }, { name: 'round', type: 'uint256' }, { name: 'deleted', type: 'bool' }, { name: 'createdAt', type: 'uint256' }], type: 'tuple' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'pollId', type: 'uint256' }, { name: 'voter', type: 'address' }], name: 'hasVoted', outputs: [{ type: 'bool' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'currentRound', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'totalPolls', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'getActivePollCount', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'round', type: 'uint256' }], name: 'getRoundPollIds', outputs: [{ type: 'uint256[]' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'owner', outputs: [{ type: 'address' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'ADMIN_ONE', outputs: [{ type: 'address' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'ADMIN_TWO', outputs: [{ type: 'address' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: '', type: 'uint256' }], name: 'polls', outputs: [{ name: 'id', type: 'uint256' }, { name: 'title', type: 'string' }, { name: 'description', type: 'string' }, { name: 'submittedBy', type: 'address' }, { name: 'voteCount', type: 'uint256' }, { name: 'round', type: 'uint256' }, { name: 'deleted', type: 'bool' }, { name: 'createdAt', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { anonymous: false, inputs: [{ indexed: true, name: 'pollId', type: 'uint256' }, { indexed: true, name: 'submittedBy', type: 'address' }, { name: 'title', type: 'string' }, { name: 'round', type: 'uint256' }, { name: 'createdAt', type: 'uint256' }], name: 'PollSubmitted', type: 'event' },
  { anonymous: false, inputs: [{ indexed: true, name: 'pollId', type: 'uint256' }, { indexed: true, name: 'voter', type: 'address' }, { name: 'newVoteCount', type: 'uint256' }], name: 'Voted', type: 'event' },
  { anonymous: false, inputs: [{ indexed: true, name: 'pollId', type: 'uint256' }, { name: 'round', type: 'uint256' }], name: 'PollDeleted', type: 'event' },
  { anonymous: false, inputs: [{ indexed: true, name: 'round', type: 'uint256' }, { name: 'winnerIds', type: 'uint256[3]' }, { name: 'closedAt', type: 'uint256' }], name: 'RoundClosed', type: 'event' },
]
