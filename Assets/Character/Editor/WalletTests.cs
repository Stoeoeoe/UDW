using System;
using System.Reflection;
using Core.Events;
using NUnit.Framework;

namespace Character.Editor
{
    public sealed class WalletTests : IEventListener<WalletChangedEvent>
    {
        private Wallet _wallet;
        private int _notifications;
        private WalletChangedEvent _lastChange;

        [SetUp]
        public void SetUp()
        {
            _notifications = 0;
            _lastChange = default;
            _wallet = new Wallet();
            EventBus<WalletChangedEvent>.Subscribe(this);
        }

        [TearDown]
        public void TearDown()
        {
            EventBus<WalletChangedEvent>.Unsubscribe(this);
        }

        public void OnEvent(WalletChangedEvent change)
        {
            if (change.Wallet != _wallet) return;
            _notifications++;
            _lastChange = change;
            Assert.That(change.Wallet.Balance, Is.EqualTo(change.Current));
        }

        [Test]
        public void RewardsClampAndNotifyOnlyWhenBalanceChanges()
        {
            Assert.That(_wallet.Balance, Is.Zero);
            Assert.That(_wallet.Add(int.MaxValue), Is.EqualTo(WalletState.MaximumBalance));
            Assert.That(_wallet.Balance, Is.EqualTo(9_999_999));
            Assert.That(_notifications, Is.EqualTo(1));
            Assert.That(_lastChange.Previous, Is.Zero);
            Assert.That(_lastChange.Current, Is.EqualTo(9_999_999));
            Assert.That(_wallet.Add(1), Is.Zero);
            _wallet.Add(0);
            Assert.That(_notifications, Is.EqualTo(1));
        }

        [Test]
        public void PaymentsAndSalesCreditsAreAllOrNothing()
        {
            _wallet.Add(10);
            Assert.That(_wallet.TrySpend(11), Is.False);
            Assert.That(_wallet.Balance, Is.EqualTo(10));
            Assert.That(_wallet.TryAdd(WalletState.MaximumBalance), Is.False);
            Assert.That(_wallet.Balance, Is.EqualTo(10));
            Assert.That(_notifications, Is.EqualTo(1));
            Assert.That(_wallet.TrySpend(10), Is.True);
            Assert.That(_wallet.Balance, Is.Zero);
            Assert.That(_wallet.TryAdd(5), Is.True);
            Assert.That(_wallet.Balance, Is.EqualTo(5));
            Assert.That(_wallet.TrySpend(0), Is.True);
            Assert.That(_notifications, Is.EqualTo(3));
        }

        [Test]
        public void NegativeAmountsCannotReverseAnOperation()
        {
            Assert.Throws<ArgumentOutOfRangeException>(() => _wallet.Add(-1));
            Assert.Throws<ArgumentOutOfRangeException>(() => _wallet.TryAdd(-1));
            Assert.Throws<ArgumentOutOfRangeException>(() => _wallet.TrySpend(-1));
            Assert.That(_wallet.Balance, Is.Zero);
            Assert.That(_notifications, Is.Zero);
        }

        [Test]
        public void BindingUsesTheLiveSavedStateWithoutCopyingTheBalance()
        {
            var state = new WalletState();
            typeof(Wallet).GetMethod("Bind", BindingFlags.Instance | BindingFlags.NonPublic)
                .Invoke(_wallet, new object[] { state });
            _wallet.Add(42);
            Assert.That(state.Balance, Is.EqualTo(42));
            Assert.That(_wallet.TrySpend(2), Is.True);
            Assert.That(state.Balance, Is.EqualTo(40));
        }
    }
}
