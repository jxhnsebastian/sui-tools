module pool::pool {
    use deepbook::clob_v2 as deepbook;
    use deepbook::custodian_v2 as custodian;
    use sui::sui::SUI;
    use sui::tx_context::{TxContext, Self};
    use sui::coin::{Coin, Self};
    use sui::balance::{Self};
    use sui::transfer;
    use sui::object::{Self, UID};
    use sui::table::{Self, Table};
    use sui::vec_map::{Self, VecMap};
    use std::option::{Self, Option};
    use sui::clock::Clock;
    use sui::type_name::{Self, TypeName};

    // Errors
    const EInsufficientFee: u64 = 0;
    const EInvalidPriceRange: u64 = 1;
    const EPoolAlreadyExists: u64 = 2;
    const EUnauthorizedCreator: u64 = 3;
    const EInsufficientBalance: u64 = 4;
    const EInvalidOrder: u64 = 5;
    const EUnauthorizedAction: u64 = 6;

    // Pool configuration
    const MIN_POOL_CREATION_FEE: u64 = 50_000_000_000; // 50 SUI
    const MAX_FEE_PERCENTAGE: u64 = 10; // 10%
    const FLOAT_SCALING: u64 = 1_000_000_000;

    // Liquidity Pool struct
    struct LiquidityPoolRegistry has key {
        id: UID,
        pools: Table<TypeName, PoolInfo>,
        creators: VecMap<address, bool>
    }

    // Pool information struct
    struct PoolInfo has store {
        creator: address,
        fee_percentage: u64,
        min_price: Option<u64>,
        max_price: Option<u64>,
        created_at: u64,
        pool: address // Store the actual pool address
    }

    // Initialize the registry
    fun init(ctx: &mut TxContext) {
        transfer::share_object(LiquidityPoolRegistry {
            id: object::new(ctx),
            pools: table::new(ctx),
            creators: vec_map::empty()
        });
    }

    // Register a new pool creator
    public fun register_pool_creator(
        registry: &mut LiquidityPoolRegistry, 
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        if (!vec_map::contains(&registry.creators, &sender)) {
            vec_map::insert(&mut registry.creators, sender, true);
        }
    }

    // Create a new liquidity pool with advanced configurations
    public fun create_advanced_pool<Base, Quote>(
        registry: &mut LiquidityPoolRegistry,
        payment: &mut Coin<SUI>, 
        fee_percentage: u64,
        min_price: Option<u64>,
        max_price: Option<u64>,
        ctx: &mut TxContext
    ) {
        // Validate pool creator
        let sender = tx_context::sender(ctx);
        assert!(vec_map::contains(&registry.creators, &sender), EUnauthorizedCreator);

        // Validate fee percentage
        assert!(fee_percentage <= MAX_FEE_PERCENTAGE, EInvalidPriceRange);

        // Validate payment
        let balance = coin::balance_mut(payment);
        assert!(balance::value(balance) >= MIN_POOL_CREATION_FEE, EInsufficientFee);

        // Split creation fee
        let fee = balance::split(balance, MIN_POOL_CREATION_FEE);
        let coin = coin::from_balance(fee, ctx);

        // Validate price range if specified
        if (option::is_some(&min_price) && option::is_some(&max_price)) {
            let min = option::destroy_some(min_price);
            let max = option::destroy_some(max_price);
            assert!(min < max, EInvalidPriceRange);
        }

        // Ensure pool doesn't already exist
        let pool_type = type_name::get<(Base, Quote)>();
        assert!(!table::contains(&registry.pools, pool_type), EPoolAlreadyExists);

        // Create the pool
        let pool = deepbook::create_pool<Base, Quote>(
            1 * FLOAT_SCALING,  // Initial price
            1,                  // Initial quantity
            coin,
            ctx
        );

        // Store pool information
        let pool_info = PoolInfo {
            creator: sender,
            fee_percentage,
            min_price,
            max_price,
            created_at: tx_context::epoch(ctx),
            pool: object::id_address(&pool)
        };

        // Add to registry
        table::add(&mut registry.pools, pool_type, pool_info);
    }

    // Create a new custodian account
    public fun new_custodian_account(ctx: &mut TxContext) {
        transfer::public_transfer(deepbook::create_account(ctx), tx_context::sender(ctx))
    }

    // Deposit base asset to the pool
    public fun make_base_deposit<Base, Quote>(
        registry: &LiquidityPoolRegistry,
        pool: &mut deepbook::Pool<Base, Quote>, 
        coin: Coin<Base>, 
        account_cap: &custodian::AccountCap
    ) {
        // Verify pool exists and sender is authorized
        let pool_type = type_name::get<(Base, Quote)>();
        assert!(table::contains(&registry.pools, pool_type), EInvalidOrder);
        
        let pool_info = table::borrow(&registry.pools, pool_type);
        assert!(tx_context::sender(account_cap.ctx()) == pool_info.creator, EUnauthorizedAction);

        deepbook::deposit_base(pool, coin, account_cap)
    }

    // Deposit quote asset to the pool
    public fun make_quote_deposit<Base, Quote>(
        registry: &LiquidityPoolRegistry,
        pool: &mut deepbook::Pool<Base, Quote>, 
        coin: Coin<Quote>, 
        account_cap: &custodian::AccountCap
    ) {
        // Verify pool exists and sender is authorized
        let pool_type = type_name::get<(Base, Quote)>();
        assert!(table::contains(&registry.pools, pool_type), EInvalidOrder);
        
        let pool_info = table::borrow(&registry.pools, pool_type);
        assert!(tx_context::sender(account_cap.ctx()) == pool_info.creator, EUnauthorizedAction);

        deepbook::deposit_quote(pool, coin, account_cap)
    }

    // Withdraw base asset from the pool
    public fun withdraw_base<BaseAsset, QuoteAsset>(
        registry: &LiquidityPoolRegistry,
        pool: &mut deepbook::Pool<BaseAsset, QuoteAsset>,
        quantity: u64,
        account_cap: &custodian::AccountCap,
        ctx: &mut TxContext
    ) {
        // Verify pool exists and sender is authorized
        let pool_type = type_name::get<(BaseAsset, QuoteAsset)>();
        assert!(table::contains(&registry.pools, pool_type), EInvalidOrder);
        
        let pool_info = table::borrow(&registry.pools, pool_type);
        assert!(tx_context::sender(account_cap.ctx()) == pool_info.creator, EUnauthorizedAction);

        // Ensure sufficient balance
        let base_balance = deepbook::get_base_balance(pool, account_cap);
        assert!(base_balance >= quantity, EInsufficientBalance);

        let base = deepbook::withdraw_base(pool, quantity, account_cap, ctx);
        transfer::public_transfer(base, tx_context::sender(ctx));
    }

    // Withdraw quote asset from the pool
    public fun withdraw_quote<BaseAsset, QuoteAsset>(
        registry: &LiquidityPoolRegistry,
        pool: &mut deepbook::Pool<BaseAsset, QuoteAsset>,
        quantity: u64,
        account_cap: &custodian::AccountCap,
        ctx: &mut TxContext
    ) {
        // Verify pool exists and sender is authorized
        let pool_type = type_name::get<(BaseAsset, QuoteAsset)>();
        assert!(table::contains(&registry.pools, pool_type), EInvalidOrder);
        
        let pool_info = table::borrow(&registry.pools, pool_type);
        assert!(tx_context::sender(account_cap.ctx()) == pool_info.creator, EUnauthorizedAction);

        // Ensure sufficient balance
        let quote_balance = deepbook::get_quote_balance(pool, account_cap);
        assert!(quote_balance >= quantity, EInsufficientBalance);

        let quote = deepbook::withdraw_quote(pool, quantity, account_cap, ctx);
        transfer::public_transfer(quote, tx_context::sender(ctx));
    }

    // Place a limit order with additional checks
    public fun place_limit_order<Base, Quote>(
        registry: &LiquidityPoolRegistry,
        pool: &mut deepbook::Pool<Base, Quote>,
        client_order_id: u64,
        price: u64, 
        quantity: u64, 
        self_matching_prevention: u8,
        is_bid: bool,
        expire_timestamp: u64,
        restriction: u8,
        clock: &Clock,
        account_cap: &custodian::AccountCap,
        ctx: &mut TxContext
    ): (u64, u64, bool, u64) {
        // Verify pool exists and sender is authorized
        let pool_type = type_name::get<(Base, Quote)>();
        assert!(table::contains(&registry.pools, pool_type), EInvalidOrder);
        
        let pool_info = table::borrow(&registry.pools, pool_type);
        assert!(tx_context::sender(account_cap.ctx()) == pool_info.creator, EUnauthorizedAction);

        // Additional price range validation if configured
        if (option::is_some(&pool_info.min_price) && option::is_some(&pool_info.max_price)) {
            let min_price = option::destroy_some(pool_info.min_price);
            let max_price = option::destroy_some(pool_info.max_price);
            assert!(price >= min_price && price <= max_price, EInvalidPriceRange);
        }

        deepbook::place_limit_order(
            pool, 
            client_order_id, 
            price, 
            quantity, 
            self_matching_prevention, 
            is_bid, 
            expire_timestamp, 
            restriction, 
            clock, 
            account_cap, 
            ctx
        )
    }

    // Place a base market order with additional checks
    public fun place_base_market_order<Base, Quote>(
        registry: &LiquidityPoolRegistry,
        pool: &mut deepbook::Pool<Base, Quote>,
        account_cap: &custodian::AccountCap,
        base_coin: Coin<Base>,
        client_order_id: u64,
        is_bid: bool,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        // Verify pool exists and sender is authorized
        let pool_type = type_name::get<(Base, Quote)>();
        assert!(table::contains(&registry.pools, pool_type), EInvalidOrder);
        
        let pool_info = table::borrow(&registry.pools, pool_type);
        assert!(tx_context::sender(account_cap.ctx()) == pool_info.creator, EUnauthorizedAction);

        let quote_coin = coin::zero<Quote>(ctx);
        let quantity = coin::value(&base_coin);
        
        let (base, quote) = place_market_order(
            registry,
            pool,
            account_cap,
            client_order_id,
            quantity,
            is_bid,
            base_coin,
            quote_coin,
            clock,
            ctx
        );

        transfer::public_transfer(base, tx_context::sender(ctx));
        transfer::public_transfer(quote, tx_context::sender(ctx));
    }

    // Place a quote market order with additional checks
    public fun place_quote_market_order<Base, Quote>(
        registry: &LiquidityPoolRegistry,
        pool: &mut deepbook::Pool<Base, Quote>,
        account_cap: &custodian::AccountCap,
        quote_coin: Coin<Quote>,
        client_order_id: u64,
        is_bid: bool,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        // Verify pool exists and sender is authorized
        let pool_type = type_name::get<(Base, Quote)>();
        assert!(table::contains(&registry.pools, pool_type), EInvalidOrder);
        
        let pool_info = table::borrow(&registry.pools, pool_type);
        assert!(tx_context::sender(account_cap.ctx()) == pool_info.creator, EUnauthorizedAction);

        let base_coin = coin::zero<Base>(ctx);
        let quantity = coin::value(&quote_coin);
        
        let (base, quote) = place_market_order(
            registry,
            pool,
            account_cap,
            client_order_id,
            quantity,
            is_bid,
            base_coin,
            quote_coin,
            clock,
            ctx
        );

        transfer::public_transfer(base, tx_context::sender(ctx));
        transfer::public_transfer(quote, tx_context::sender(ctx));
    }

    // Internal market order placement with additional checks
    fun place_market_order<Base, Quote>(
        registry: &LiquidityPoolRegistry,
        pool: &mut deepbook::Pool<Base, Quote>,
        account_cap: &custodian::AccountCap,
        client_order_id: u64,
        quantity: u64,
        is_bid: bool,
        base_coin: Coin<Base>,
        quote_coin: Coin<Quote>,
        clock: &Clock,
        ctx: &mut TxContext,
    ): (Coin<Base>, Coin<Quote>) {
        // Verify pool exists and sender is authorized
        let pool_type = type_name::get<(Base, Quote)>();
        assert!(table::contains(&registry.pools, pool_type), EInvalidOrder);
        
        let pool_info = table::borrow(&registry.pools, pool_type);
        assert!(tx_context::sender(account_cap.ctx()) == pool_info.creator, EUnauthorizedAction);

        deepbook::place_market_order(
            pool, 
            account_cap, 
            client_order_id, 
            quantity, 
            is_bid, 
            base_coin, 
            quote_coin, 
            clock, 
            ctx
        )
    }

    public fun swap_exact_base_for_quote<Base, Quote>(
        pool: &mut deepbook::Pool<Base, Quote>,
        client_order_id: u64,
        account_cap: &custodian::AccountCap,
        quantity: u64,
        base_coin: Coin<Base>,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let quote_coin = coin::zero<Quote>(ctx);
        let (base, quote, _) = deepbook::swap_exact_base_for_quote(
            pool,
            client_order_id,
            account_cap,
            quantity,
            base_coin,
            quote_coin,
            clock,
            ctx
        );
        transfer::public_transfer(base, tx_context::sender(ctx));
        transfer::public_transfer(quote, tx_context::sender(ctx));
    }

    public fun swap_exact_quote_for_base<Base, Quote>(
        pool: &mut deepbook::Pool<Base, Quote>,
        account_cap: &custodian::AccountCap,
        quote_coin: Coin<Quote>,
        client_order_id: u64,
        quantity: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let (base, quote, _) = deepbook::swap_exact_quote_for_base(
            pool,
            client_order_id,
            account_cap,
            quantity,
            clock,
            quote_coin,
            ctx
        );
        transfer::public_transfer(base, tx_context::sender(ctx));
        transfer::public_transfer(quote, tx_context::sender(ctx));
    }
}