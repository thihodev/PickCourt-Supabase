import { Redis } from 'npm:@upstash/redis'

export interface BookedSlotData {
  courtId: string
  startTime: string
  endTime: string
  bookingId: string
  slotId: string
}

export class UpstashBookedSlotService {
  private redis: Redis

  constructor(redisUrl?: string, redisToken?: string) {
    this.redis = new Redis({
      url: redisUrl || Deno.env.get('UPSTASH_REDIS_REST_URL'),
      token: redisToken || Deno.env.get('UPSTASH_REDIS_REST_TOKEN')
    })
  }

  private generateKey(clubId: string, date: string): string {
    return `booked_slots:${clubId}:${date}`
  }

  private getExpiryTimestamp(bookingDate: string): number {
    const expiryDate = new Date(bookingDate)
    expiryDate.setDate(expiryDate.getDate() + 1)
    expiryDate.setHours(0, 0, 0, 0)
    return Math.floor(expiryDate.getTime() / 1000)
  }

  async addBookedSlot(
    clubId: string,
    date: string,
    slotData: BookedSlotData
  ): Promise<void> {
    const key = this.generateKey(clubId, date)
    const expiryTimestamp = this.getExpiryTimestamp(date)

    await this.redis.hset(key, {
      [`${slotData.courtId}:${slotData.startTime}:${slotData.endTime}`]: JSON.stringify(slotData)
    })

    await this.redis.expireat(key, expiryTimestamp)
  }

  async removeBookedSlot(
    clubId: string,
    date: string,
    courtId: string,
    startTime: string,
    endTime: string
  ): Promise<void> {
    const key = this.generateKey(clubId, date)
    const field = `${courtId}:${startTime}:${endTime}`

    await this.redis.hdel(key, field)
  }

  async getBookedSlots(clubId: string, date: string): Promise<BookedSlotData[]> {
    const key = this.generateKey(clubId, date)
    const data = await this.redis.hgetall(key)

    if (!data) return []

    return Object.values(data).map(slot => {
      try {
        // If slot is already an object, return it directly
        if (typeof slot === 'object' && slot !== null) {
          return slot as BookedSlotData
        }
        // If slot is a string, parse it
        return JSON.parse(slot as string)
      } catch (error) {
        console.error('Error parsing slot data:', slot, error)
        return null
      }
    }).filter(slot => slot !== null) as BookedSlotData[]
  }

  async isSlotBooked(
    clubId: string,
    date: string,
    courtId: string,
    startTime: string,
    endTime: string
  ): Promise<boolean> {
    const key = this.generateKey(clubId, date)
    const field = `${courtId}:${startTime}:${endTime}`

    const exists = await this.redis.hexists(key, field)
    return exists === 1
  }

  async removeAllSlotsForBooking(
    clubId: string,
    date: string,
    bookingId: string
  ): Promise<void> {
    const key = this.generateKey(clubId, date)
    const allSlots = await this.redis.hgetall(key)

    if (!allSlots) return

    const fieldsToDelete: string[] = []

    for (const [field, slotJson] of Object.entries(allSlots)) {
      try {
        let slot: BookedSlotData
        if (typeof slotJson === 'object' && slotJson !== null) {
          slot = slotJson as BookedSlotData
        } else {
          slot = JSON.parse(slotJson as string) as BookedSlotData
        }
        if (slot.bookingId === bookingId) {
          fieldsToDelete.push(field)
        }
      } catch (error) {
        console.error('Error parsing slot data in removeAllSlotsForBooking:', slotJson, error)
      }
    }

    if (fieldsToDelete.length > 0) {
      await this.redis.hdel(key, ...fieldsToDelete)
    }
  }

  async getBookedSlotsByBooking(
    clubId: string,
    date: string,
    bookingId: string
  ): Promise<BookedSlotData[]> {
    const key = this.generateKey(clubId, date)
    const allSlots = await this.redis.hgetall(key)

    if (!allSlots) return []

    return Object.values(allSlots)
      .map(slot => {
        try {
          if (typeof slot === 'object' && slot !== null) {
            return slot as BookedSlotData
          }
          return JSON.parse(slot as string) as BookedSlotData
        } catch (error) {
          console.error('Error parsing slot data in getBookedSlotsByBooking:', slot, error)
          return null
        }
      })
      .filter(slot => slot !== null && slot.bookingId === bookingId) as BookedSlotData[]
  }
}