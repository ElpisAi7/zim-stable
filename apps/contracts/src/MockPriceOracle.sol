// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title MockPriceOracle
 * @dev Simple mock oracle for testing AUD/USD exchange rates
 * In production, replace with Chainlink or similar oracle
 */
contract MockPriceOracle {
    // Mock exchange rate: 1 AUD = 0.65 USD (can be updated)
    uint256 public audToUsdRate = 650000; // 0.65 with 6 decimals for precision

    address public owner;

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can update rate");
        _;
    }

    /**
     * @dev Get the current AUD to USD exchange rate
     * @return rate The exchange rate with 6 decimal places (650000 = 0.65)
     */
    function getAudToUsdRate() external view returns (uint256) {
        return audToUsdRate;
    }

    /**
     * @dev Convert AUD amount to USD
     * @param audAmount Amount in AUD with 18 decimals
     * @return usdAmount Equivalent amount in USD with 18 decimals
     */
    function convertAudToUsd(uint256 audAmount) external view returns (uint256) {
        // audAmount * rate / 10^6 (since rate has 6 decimals)
        return (audAmount * audToUsdRate) / 1000000;
    }

    /**
     * @dev Convert USD amount to AUD
     * @param usdAmount Amount in USD with 18 decimals
     * @return audAmount Equivalent amount in AUD with 18 decimals
     */
    function convertUsdToAud(uint256 usdAmount) external view returns (uint256) {
        // usdAmount * 10^6 / rate
        return (usdAmount * 1000000) / audToUsdRate;
    }

    /**
     * @dev Update the exchange rate (only owner)
     * @param newRate New exchange rate with 6 decimal places
     */
    function updateRate(uint256 newRate) external onlyOwner {
        require(newRate > 0, "Rate must be greater than 0");
        audToUsdRate = newRate;
    }
}
