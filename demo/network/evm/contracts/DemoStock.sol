// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

/// Nad Computer Company (NAD): the demo market's single stock.
///
/// The contract is both the ERC-20 share token and the exchange: `buy` mints
/// shares for native currency at the current price and `sell` burns them and
/// pays out the same way, so supply is elastic and no order book or
/// counterparty exists. The price is a pure function of the block timestamp
/// (layered piecewise-linear value noise around a base price), so it moves
/// continuously with no oracle and no storage growth, and it is reproducible
/// off chain from the same formula. The demo network's guard seeds the
/// contract with far more native balance than its funded accounts can win
/// from it, so payouts do not run dry. Rounding floors in the contract's
/// favor.
contract DemoStock {
    string public constant name = "Nad Computer Company";
    string public constant symbol = "NAD";
    uint8 public constant decimals = 18;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(
        address indexed owner,
        address indexed spender,
        uint256 value
    );

    // ----- Price ------------------------------------------------------------

    uint256 private constant UNIT = 1e18;
    // The demo presents native currency as dollars, so the base price reads
    // as $40.00 per share.
    uint256 private constant BASE_PRICE = 40e18;

    /// Signed unit noise in [-1e18, 1e18], deterministic per
    /// (layerId, bucket).
    function noise(uint256 layerId, uint256 bucket)
        private
        pure
        returns (int256)
    {
        uint256 hashed = uint256(keccak256(abi.encodePacked(layerId, bucket)));
        return int256(hashed % (2 * UNIT + 1)) - int256(UNIT);
    }

    /// One layer of piecewise-linear value noise, continuous in `timestamp`.
    ///
    /// Time is cut into buckets of `period` seconds. The layer hashes the
    /// unit noise at the enclosing bucket's two boundaries and linearly
    /// interpolates between them by how far `timestamp` sits into the
    /// bucket, scaled to [-amplitude, amplitude]. `layerId` salts the hash
    /// so layers do not correlate.
    function noiseLayerAt(
        uint256 timestamp,
        uint256 layerId,
        uint256 period,
        uint256 amplitude
    ) private pure returns (int256) {
        uint256 bucket = timestamp / period;
        int256 startNoise = noise(layerId, bucket);
        int256 endNoise = noise(layerId, bucket + 1);
        int256 interpolated = startNoise +
            ((endNoise - startNoise) * int256(timestamp % period))
            / int256(period);
        return (int256(amplitude) * interpolated) / int256(UNIT);
    }

    /// Share price at Unix `timestamp`, in native wei per whole (1e18)
    /// share.
    ///
    /// Layered piecewise-linear value noise around the base price: a slow
    /// drift, a medium swing, and a fast wiggle keep the result within
    /// $40 +/- $9.10, always positive. The demo's chart mirrors this formula
    /// off chain; changing any constant here changes every historical point
    /// the chart draws.
    function priceAt(uint256 timestamp) public pure returns (uint256) {
        int256 slowDrift = noiseLayerAt(timestamp, 1, 8 hours, 6e18);
        int256 mediumSwing = noiseLayerAt(timestamp, 2, 10 minutes, 2.5e18);
        int256 fastWiggle = noiseLayerAt(timestamp, 3, 45 seconds, 0.6e18);
        return uint256(
            int256(BASE_PRICE) + slowDrift + mediumSwing + fastWiggle
        );
    }

    /// Current share price, in native wei per whole share.
    function price() external view returns (uint256) {
        return priceAt(block.timestamp);
    }

    // ----- Trading ----------------------------------------------------------

    /// Buys shares at the current price with the attached native value,
    /// minting them to the caller. Reverts when the value rounds to zero
    /// shares.
    function buy() external payable {
        uint256 shares = (msg.value * UNIT) / priceAt(block.timestamp);
        require(shares > 0, "value buys zero shares");
        totalSupply += shares;
        balanceOf[msg.sender] += shares;
        emit Transfer(address(0), msg.sender, shares);
    }

    /// Sells `shares` at the current price, burning them and paying the
    /// caller in native currency. Reverts when the caller holds fewer shares,
    /// when the amount rounds to a zero payout, or when the payout transfer
    /// fails. Shares are burned before the payout call, so re-entering `sell`
    /// cannot spend the same shares twice.
    function sell(uint256 shares) external {
        uint256 held = balanceOf[msg.sender];
        require(shares <= held, "insufficient shares");
        uint256 payout = (shares * priceAt(block.timestamp)) / UNIT;
        require(payout > 0, "shares sell for zero");
        balanceOf[msg.sender] = held - shares;
        totalSupply -= shares;
        emit Transfer(msg.sender, address(0), shares);
        (bool paid, ) = msg.sender.call{value: payout}("");
        require(paid, "payout failed");
    }

    // ----- ERC-20 transfers -------------------------------------------------

    function transfer(address to, uint256 value) external returns (bool) {
        moveShares(msg.sender, to, value);
        return true;
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value)
        external
        returns (bool)
    {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            require(value <= allowed, "insufficient allowance");
            allowance[from][msg.sender] = allowed - value;
        }
        moveShares(from, to, value);
        return true;
    }

    function moveShares(address from, address to, uint256 value) private {
        // Standard ERC-20 guard: only sell() burns, so shares sent to the
        // zero address would be stuck rather than destroyed.
        require(to != address(0), "transfer to zero address");
        uint256 held = balanceOf[from];
        require(value <= held, "insufficient balance");
        balanceOf[from] = held - value;
        balanceOf[to] += value;
        emit Transfer(from, to, value);
    }
}
