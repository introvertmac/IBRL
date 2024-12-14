interface JitoMEVRewards {
  epoch: number;
  total_network_mev_lamports: number;
  jito_stake_weight_lamports: number;
  mev_reward_per_lamport: number;
}

const rateLimiter = {
  lastRequest: 0,
  minInterval: 100,
  
  async throttle() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequest;
    if (timeSinceLastRequest < this.minInterval) {
      await new Promise(resolve => setTimeout(resolve, this.minInterval - timeSinceLastRequest));
    }
    this.lastRequest = Date.now();
  }
};

export async function getJitoMEVRewards(epoch: number): Promise<JitoMEVRewards> {
  await rateLimiter.throttle();
  
  try {
    if (epoch < 0) {
      throw new Error('INVALID_EPOCH');
    }

    const response = await fetch('https://kobe.mainnet.jito.network/api/v1/mev_rewards', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ epoch })
    });

    if (response.status === 429) {
      throw new Error('RATE_LIMIT');
    }

    if (response.status === 404) {
      throw new Error('EPOCH_NOT_FOUND');
    }

    if (!response.ok) {
      throw new Error(`HTTP_ERROR_${response.status}`);
    }

    const data = await response.json();
    return data as JitoMEVRewards;
  } catch (error) {
    console.error('Error fetching Jito MEV rewards:', error);
    throw error;
  }
}
