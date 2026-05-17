const User = require('../models/User');
const WalletTransaction = require('../models/WalletTransaction');

const normalizeText = (value) => String(value || '').trim();

const creditPendingWalletTopup = async ({
    filter,
    txnId = '',
    source = 'system',
    adminNotes = ''
}) => {
    const safeTxnId = normalizeText(txnId);
    if (safeTxnId) {
        const duplicate = await WalletTransaction.findOne({
            txnId: safeTxnId,
            status: 'completed'
        }).lean();
        if (duplicate) {
            return {
                ok: false,
                status: 'duplicate',
                transaction: duplicate,
                message: `Transaction id is already credited to ${duplicate.referenceCode || duplicate.orderId || duplicate._id}.`
            };
        }
    }

    const transaction = await WalletTransaction.findOneAndUpdate(
        {
            ...(filter || {}),
            type: 'topup',
            status: 'pending'
        },
        {
            $set: {
                status: 'completed',
                txnId: safeTxnId,
                reviewedBy: normalizeText(source),
                reviewedAt: new Date(),
                adminNotes: normalizeText(adminNotes)
            }
        },
        { new: true }
    );

    if (!transaction) {
        return {
            ok: false,
            status: 'not_pending',
            message: 'No pending top-up matched this payment.'
        };
    }

    const creditedUser = await User.findOneAndUpdate(
        { discordId: transaction.discordId },
        { $inc: { walletBalanceCents: transaction.amountCents } },
        { new: true }
    );
    if (!creditedUser) {
        transaction.status = 'pending';
        transaction.reviewedBy = '';
        transaction.reviewedAt = null;
        transaction.adminNotes = 'Credit failed because linked Discord user was not found.';
        await transaction.save();
        return {
            ok: false,
            status: 'user_not_found',
            transaction,
            message: 'Linked Discord user was not found.'
        };
    }

    transaction.balanceAfterCents = Number(creditedUser.walletBalanceCents || 0);
    await transaction.save();

    return {
        ok: true,
        status: 'credited',
        transaction,
        user: creditedUser
    };
};

module.exports = {
    creditPendingWalletTopup
};
