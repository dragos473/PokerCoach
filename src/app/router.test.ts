import { describe, it, expect } from 'vitest'
import { matchRoute } from './router'

describe('matchRoute', () => {
  it('matches static and param routes', () => {
    expect(matchRoute('/', '/')).toEqual({})
    expect(matchRoute('/ranges', '/ranges')).toEqual({})
    expect(matchRoute('/ranges/:id', '/ranges/abc%20d')).toEqual({ id: 'abc d' })
    expect(matchRoute('/ranges/:id', '/ranges')).toBeNull()
    expect(matchRoute('/odds/:tab', '/odds/quiz?x=1')).toEqual({ tab: 'quiz' })
  })
})
