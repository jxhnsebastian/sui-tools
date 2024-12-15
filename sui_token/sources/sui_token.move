module sui_token::stt4 {
      use sui::coin::{Self, TreasuryCap, Coin};
      use 0x2::url;
  
      public struct STT4 has drop {}
  
      fun init(witness: STT4, ctx: &mut TxContext) {
          let (treasury, coin_metadata) = coin::create_currency(
              witness, 
              9, 
              b"STT4", 
              b"Smithi Test Token 4", 
              b"Token creator token.", 
              option::some(url::new_unsafe_from_bytes(b"https://pbs.twimg.com/profile_images/1792571582902095872/1h0Tm7RU_400x400.jpg")), 
              ctx
          );
  
          transfer::public_transfer(treasury, tx_context::sender(ctx));
          transfer::public_freeze_object(coin_metadata);
      }
  
      public fun mint(
          treasury_cap: &mut TreasuryCap<STT4>, 
          amount: u64, 
          ctx: &mut TxContext
      ): Coin<STT4> {
          coin::mint(treasury_cap, amount, ctx)
      }
  
      public fun burn(
          treasury_cap: &mut TreasuryCap<STT4>, 
          coin: Coin<STT4>
      ) {
          coin::burn(treasury_cap, coin);
      }
  }