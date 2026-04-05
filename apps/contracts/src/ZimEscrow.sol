// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// Simple ERC20 interface for token transfers
interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

/**
 * @title ZimEscrow
 * @dev P2P Escrow contract for Seller-Buyer transactions with phone verification
 */
contract ZimEscrow {
    
    // ============ State Variables ============
    
    address public admin; // Third party for dispute resolution
    
    // Simple lock mechanism for reentrancy protection
    uint256 private locked = 0;
    
    enum EscrowStatus {
        Active,
        PaymentSignaled,
        FundsReleased,
        Disputed,
        Cancelled
    }
    
    struct Escrow {
        address seller;
        address buyer;
        address token; // USDC or cUSD token address
        uint256 amount;
        string sellerPhoneNumber;
        EscrowStatus status;
        uint256 createdAt;
        uint256 paymentSignaledAt;
    }
    
    // Mapping of escrow ID to escrow details
    mapping(uint256 => Escrow) public escrows;
    uint256 public escrowCounter;
    
    // ============ Events ============
    
    event EscrowCreated(
        uint256 indexed escrowId,
        address indexed seller,
        address indexed token,
        uint256 amount,
        string sellerPhoneNumber
    );
    
    event PaymentSignaled(
        uint256 indexed escrowId,
        address indexed buyer
    );
    
    event FundsReleased(
        uint256 indexed escrowId,
        address indexed seller,
        uint256 amount
    );
    
    event DisputeRaised(
        uint256 indexed escrowId,
        address indexed raiser,
        string reason
    );
    
    event DisputeResolved(
        uint256 indexed escrowId,
        address indexed recipient,
        uint256 amount
    );
    
    event EscrowCancelled(
        uint256 indexed escrowId,
        address indexed seller,
        uint256 amount
    );
    
    // ============ Modifiers ============
    
    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin can call this function");
        _;
    }
    
    modifier onlyValidEscrow(uint256 escrowId) {
        require(escrowId < escrowCounter, "Invalid escrow ID");
        _;
    }
    
    modifier onlyActivated(uint256 escrowId) {
        require(escrows[escrowId].status == EscrowStatus.Active, "Escrow not active");
        _;
    }
    
    modifier nonReentrant() {
        require(locked == 0, "No reentrancy");
        locked = 1;
        _;
        locked = 0;
    }
    
    // ============ Constructor ============
    
    constructor(address _admin) {
        require(_admin != address(0), "Invalid admin address");
        admin = _admin;
        escrowCounter = 0;
    }
    
    // ============ Seller Functions ============
    
    /**
     * @dev Seller deposits funds into escrow with their phone number
     * @param _token Token address (USDC or cUSD)
     * @param _amount Amount to escrow
     * @param _phoneNumber Seller's phone number for verification
     */
    function depositEscrow(
        address _token,
        uint256 _amount,
        string memory _phoneNumber
    ) external nonReentrant returns (uint256) {
        require(_token != address(0), "Invalid token address");
        require(_amount > 0, "Amount must be greater than 0");
        require(bytes(_phoneNumber).length > 0, "Phone number required");
        
        // Transfer tokens from seller to contract
        IERC20(_token).transferFrom(msg.sender, address(this), _amount);
        
        // Create escrow
        uint256 escrowId = escrowCounter;
        escrows[escrowId] = Escrow(
            msg.sender, // seller
            address(0), // buyer (not assigned yet)
            _token,
            _amount,
            _phoneNumber,
            EscrowStatus.Active,
            block.timestamp,
            0
        );
        
        escrowCounter++;
        
        emit EscrowCreated(escrowId, msg.sender, _token, _amount, _phoneNumber);
        
        return escrowId;
    }
    
    /**
     * @dev Seller releases funds to buyer after verifying payment
     * @param _escrowId The escrow to release funds for
     */
    function releaseFunds(uint256 _escrowId)
        external
        onlyValidEscrow(_escrowId)
        nonReentrant
    {
        Escrow storage escrow = escrows[_escrowId];
        
        require(msg.sender == escrow.seller, "Only seller can release funds");
        require(escrow.status == EscrowStatus.PaymentSignaled, "Payment not signaled yet");
        
        escrow.status = EscrowStatus.FundsReleased;
        
        // Transfer tokens to buyer
        IERC20(escrow.token).transfer(escrow.buyer, escrow.amount);
        
        emit FundsReleased(_escrowId, escrow.seller, escrow.amount);
    }
    
    /**
     * @dev Seller cancels active escrow and withdraws funds
     * @param _escrowId The escrow to cancel
     */
    function cancelEscrow(uint256 _escrowId)
        external
        onlyValidEscrow(_escrowId)
        onlyActivated(_escrowId)
        nonReentrant
    {
        Escrow storage escrow = escrows[_escrowId];
        
        require(msg.sender == escrow.seller, "Only seller can cancel");
        
        escrow.status = EscrowStatus.Cancelled;
        
        // Return funds to seller
        IERC20(escrow.token).transfer(escrow.seller, escrow.amount);
        
        emit EscrowCancelled(_escrowId, escrow.seller, escrow.amount);
    }
    
    // ============ Buyer Functions ============
    
    /**
     * @dev Buyer signals that they have sent payment (e.g., via EcoCash)
     * @param _escrowId The escrow ID
     */
    function signalPayment(uint256 _escrowId)
        external
        onlyValidEscrow(_escrowId)
        onlyActivated(_escrowId)
    {
        Escrow storage escrow = escrows[_escrowId];
        
        require(escrow.buyer == address(0) || escrow.buyer == msg.sender, "Escrow already has a buyer");
        
        if (escrow.buyer == address(0)) {
            escrow.buyer = msg.sender;
        }
        
        escrow.status = EscrowStatus.PaymentSignaled;
        escrow.paymentSignaledAt = block.timestamp;
        
        emit PaymentSignaled(_escrowId, msg.sender);
    }
    
    // ============ Dispute Functions ============
    
    /**
     * @dev Raise a dispute on an escrow (called by either buyer or seller)
     * @param _escrowId The escrow ID
     * @param _reason Reason for dispute
     */
    function raiseDispute(uint256 _escrowId, string memory _reason)
        external
        onlyValidEscrow(_escrowId)
    {
        Escrow storage escrow = escrows[_escrowId];
        
        require(
            msg.sender == escrow.seller || msg.sender == escrow.buyer,
            "Only seller or buyer can raise dispute"
        );
        
        require(
            escrow.status != EscrowStatus.FundsReleased && 
            escrow.status != EscrowStatus.Cancelled,
            "Cannot dispute completed or cancelled escrow"
        );
        
        escrow.status = EscrowStatus.Disputed;
        
        emit DisputeRaised(_escrowId, msg.sender, _reason);
    }
    
    /**
     * @dev Admin resolves a dispute and releases funds to the appropriate party
     * @param _escrowId The escrow ID
     * @param _recipient Address to receive the funds
     */
    function resolveDispute(uint256 _escrowId, address _recipient)
        external
        onlyAdmin
        onlyValidEscrow(_escrowId)
        nonReentrant
    {
        Escrow storage escrow = escrows[_escrowId];
        
        require(escrow.status == EscrowStatus.Disputed, "Escrow not in dispute");
        require(
            _recipient == escrow.seller || _recipient == escrow.buyer,
            "Recipient must be seller or buyer"
        );
        
        escrow.status = EscrowStatus.FundsReleased;
        
        // Transfer tokens to recipient
        IERC20(escrow.token).transfer(_recipient, escrow.amount);
        
        emit DisputeResolved(_escrowId, _recipient, escrow.amount);
    }
    
    // ============ View Functions ============
    
    /**
     * @dev Get escrow details
     * @param _escrowId The escrow ID
     */
    function getEscrow(uint256 _escrowId)
        external
        view
        onlyValidEscrow(_escrowId)
        returns (Escrow memory)
    {
        return escrows[_escrowId];
    }
    
    /**
     * @dev Check if an escrow is active
     * @param _escrowId The escrow ID
     */
    function isActive(uint256 _escrowId)
        external
        view
        returns (bool)
    {
        return escrows[_escrowId].status == EscrowStatus.Active;
    }
    
    /**
     * @dev Get total escrows created
     */
    function getTotalEscrows() external view returns (uint256) {
        return escrowCounter;
    }
}
