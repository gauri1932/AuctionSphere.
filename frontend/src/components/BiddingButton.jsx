import React, { useState } from 'react';
import { socket } from '../utils/socket';
import './BiddingButton.css';

const BiddingButton = ({ currentLivePlayer, currentHighestBid, team, categoryBasePrices }) => {
  const [isBidding, setIsBidding] = useState(false);

  if (!currentLivePlayer) return null;

  const categoryBasePrice = categoryBasePrices[currentLivePlayer.category] || 1000;
  
  // Smart Budget Guard Logic
  const getNextBid = () => {
    return currentHighestBid + (currentHighestBid >= 5000 ? 500 : 100); // Dynamic step logic can be adjusted
  };

  const nextBidAmount = getNextBid();
  const willHaveLeftAfterBid = team.remainingBudget - nextBidAmount;

  const canAfford = willHaveLeftAfterBid >= 0;

  const handleBid = () => {
    if (!canAfford || isBidding) return;
    
    setIsBidding(true); // Disable immediately (No Undo Policy)
    
    socket.emit('placeBid', {
        teamId: team.id,
        teamName: team.name,
        bidAmount: nextBidAmount,
        categoryBasePrice,
        remainingBudget: team.remainingBudget,
        remainingSlots: team.remainingSlots
    });

    // Re-enable after server acknowledges or shortly after
    setTimeout(() => setIsBidding(false), 800);
  };

  return (
    <div className="flex flex-col items-center mt-4">
      {canAfford ? (
        <button 
          onClick={handleBid}
          disabled={isBidding}
          className="bg-highlight hover:bg-red-600 text-white font-bold py-4 px-8 rounded-full shadow-lg transform transition hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed text-2xl"
        >
          Bid ₹{nextBidAmount}
        </button>
      ) : (
        <div className="bg-gray-800 text-rose-500 font-semibold p-4 rounded-lg border border-rose-500">
          Budget Guard Active: Insufficient funds to fill roster.
        </div>
      )}
      <p className="text-gray-400 mt-2 text-sm">
        Remaining Budget: ₹{team.remainingBudget} | Next Bid: ₹{nextBidAmount}
      </p>
    </div>
  );
};

export default BiddingButton;
