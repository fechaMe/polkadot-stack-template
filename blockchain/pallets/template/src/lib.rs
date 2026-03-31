//! # Template Pallet - Counter
//!
//! A simple counter pallet that demonstrates core FRAME concepts:
//! - Per-account storage using `StorageMap`
//! - Dispatchable calls (`set_counter`, `increment`)
//! - Events and errors
//! - Weight annotations via benchmarks
//! - Mock runtime and unit tests
//!
//! This pallet implements the same "counter" concept as the EVM and ink! contract
//! templates, allowing developers to compare the three approaches side-by-side.

#![cfg_attr(not(feature = "std"), no_std)]

pub use pallet::*;

#[cfg(test)]
mod mock;

#[cfg(test)]
mod tests;

pub mod weights;

#[cfg(feature = "runtime-benchmarks")]
mod benchmarking;

#[frame::pallet]
pub mod pallet {
	use crate::weights::WeightInfo;
	use frame::prelude::*;

	#[pallet::pallet]
	pub struct Pallet<T>(_);

	/// Configuration trait for this pallet.
	#[pallet::config]
	pub trait Config: frame_system::Config {
		/// The overarching runtime event type.
		type RuntimeEvent: From<Event<Self>> + IsType<<Self as frame_system::Config>::RuntimeEvent>;

		/// A type representing the weights required by the dispatchables of this pallet.
		type WeightInfo: WeightInfo;
	}

	/// Storage for counter values, one per account.
	#[pallet::storage]
	pub type Counters<T: Config> = StorageMap<_, Blake2_128Concat, T::AccountId, u32, ValueQuery>;

	/// Events emitted by this pallet.
	#[pallet::event]
	#[pallet::generate_deposit(pub(super) fn deposit_event)]
	pub enum Event<T: Config> {
		/// A counter was set to a specific value.
		CounterSet {
			/// The account that set the counter.
			who: T::AccountId,
			/// The new counter value.
			value: u32,
		},
		/// A counter was incremented.
		CounterIncremented {
			/// The account whose counter was incremented.
			who: T::AccountId,
			/// The new counter value after incrementing.
			new_value: u32,
		},
	}

	/// Errors that can occur in this pallet.
	#[pallet::error]
	pub enum Error<T> {
		/// Counter would overflow if incremented.
		CounterOverflow,
	}

	/// Dispatchable calls.
	#[pallet::call]
	impl<T: Config> Pallet<T> {
		/// Set the counter for the calling account to a specific value.
		#[pallet::call_index(0)]
		#[pallet::weight(T::WeightInfo::set_counter())]
		pub fn set_counter(origin: OriginFor<T>, value: u32) -> DispatchResult {
			let who = ensure_signed(origin)?;
			Counters::<T>::insert(&who, value);
			Self::deposit_event(Event::CounterSet { who, value });
			Ok(())
		}

		/// Increment the counter for the calling account by one.
		#[pallet::call_index(1)]
		#[pallet::weight(T::WeightInfo::increment())]
		pub fn increment(origin: OriginFor<T>) -> DispatchResult {
			let who = ensure_signed(origin)?;
			let new_value = Counters::<T>::get(&who)
				.checked_add(1)
				.ok_or(Error::<T>::CounterOverflow)?;
			Counters::<T>::insert(&who, new_value);
			Self::deposit_event(Event::CounterIncremented { who, new_value });
			Ok(())
		}
	}
}
