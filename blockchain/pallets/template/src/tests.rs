use crate::{mock::*, pallet::Error, Counters};
use frame::testing_prelude::*;

#[test]
fn set_counter_works() {
	new_test_ext().execute_with(|| {
		// Counter starts at zero (ValueQuery default).
		assert_eq!(Counters::<Test>::get(1), 0);
		// Set it to 42.
		assert_ok!(Counter::set_counter(RuntimeOrigin::signed(1), 42));
		assert_eq!(Counters::<Test>::get(1), 42);
	});
}

#[test]
fn set_counter_emits_event() {
	new_test_ext().execute_with(|| {
		// Go past genesis block so events get deposited.
		System::set_block_number(1);
		assert_ok!(Counter::set_counter(RuntimeOrigin::signed(1), 42));
		System::assert_last_event(
			crate::Event::CounterSet { who: 1, value: 42 }.into(),
		);
	});
}

#[test]
fn increment_works() {
	new_test_ext().execute_with(|| {
		assert_ok!(Counter::set_counter(RuntimeOrigin::signed(1), 10));
		assert_ok!(Counter::increment(RuntimeOrigin::signed(1)));
		assert_eq!(Counters::<Test>::get(1), 11);
	});
}

#[test]
fn increment_from_zero_works() {
	new_test_ext().execute_with(|| {
		// Incrementing when no value was set should go from 0 to 1.
		assert_ok!(Counter::increment(RuntimeOrigin::signed(1)));
		assert_eq!(Counters::<Test>::get(1), 1);
	});
}

#[test]
fn increment_emits_event() {
	new_test_ext().execute_with(|| {
		System::set_block_number(1);
		assert_ok!(Counter::set_counter(RuntimeOrigin::signed(1), 5));
		assert_ok!(Counter::increment(RuntimeOrigin::signed(1)));
		System::assert_last_event(
			crate::Event::CounterIncremented { who: 1, new_value: 6 }.into(),
		);
	});
}

#[test]
fn increment_overflow_fails() {
	new_test_ext().execute_with(|| {
		// Set counter to max value.
		Counters::<Test>::insert(1, u32::MAX);
		// Incrementing should fail with overflow error.
		assert_noop!(
			Counter::increment(RuntimeOrigin::signed(1)),
			Error::<Test>::CounterOverflow,
		);
	});
}

#[test]
fn counters_are_per_account() {
	new_test_ext().execute_with(|| {
		// Each account has an independent counter.
		assert_ok!(Counter::set_counter(RuntimeOrigin::signed(1), 100));
		assert_ok!(Counter::set_counter(RuntimeOrigin::signed(2), 200));
		assert_eq!(Counters::<Test>::get(1), 100);
		assert_eq!(Counters::<Test>::get(2), 200);

		// Incrementing one doesn't affect the other.
		assert_ok!(Counter::increment(RuntimeOrigin::signed(1)));
		assert_eq!(Counters::<Test>::get(1), 101);
		assert_eq!(Counters::<Test>::get(2), 200);
	});
}

#[test]
fn unsigned_origin_is_rejected() {
	new_test_ext().execute_with(|| {
		assert_noop!(
			Counter::set_counter(RuntimeOrigin::none(), 42),
			DispatchError::BadOrigin,
		);
		assert_noop!(
			Counter::increment(RuntimeOrigin::none()),
			DispatchError::BadOrigin,
		);
	});
}
