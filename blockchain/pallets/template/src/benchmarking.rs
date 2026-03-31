//! Benchmarking setup for pallet-template

use super::*;
use frame::{deps::frame_benchmarking::v2::*, prelude::*};

#[benchmarks]
mod benchmarks {
	use super::*;
	#[cfg(test)]
	use crate::pallet::Pallet as Counter;
	use frame_system::RawOrigin;

	#[benchmark]
	fn set_counter() {
		let caller: T::AccountId = whitelisted_caller();
		#[extrinsic_call]
		set_counter(RawOrigin::Signed(caller.clone()), 42);

		assert_eq!(Counters::<T>::get(&caller), 42);
	}

	#[benchmark]
	fn increment() {
		let caller: T::AccountId = whitelisted_caller();
		Counters::<T>::insert(&caller, 10);
		#[extrinsic_call]
		increment(RawOrigin::Signed(caller.clone()));

		assert_eq!(Counters::<T>::get(&caller), 11);
	}

	impl_benchmark_test_suite!(Counter, crate::mock::new_test_ext(), crate::mock::Test);
}
